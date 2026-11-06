//! Safe deletion, cancellation, and rollback. Synthetic data only.

use swish_data::model::new_id;
use swish_data::{Error, Field, ProjectInput, ReminderInput, Store};

fn project(store: &mut Store, name: &str) -> String {
    store
        .create_project(&ProjectInput {
            name: name.into(),
            description: String::new(),
            deadline: "2026-12-31".into(),
        })
        .unwrap()
        .id
}

fn reminder(store: &mut Store, project_id: Option<&str>, title: &str) -> String {
    store
        .create_reminder(&ReminderInput {
            project_id: project_id.map(Into::into),
            title: title.into(),
            text: String::new(),
            due_date: None,
        })
        .unwrap()
        .id
}

#[test]
fn project_deletion_removes_exactly_its_reminders() {
    let mut store = Store::open_in_memory().unwrap();
    let (a, b) = (project(&mut store, "A"), project(&mut store, "B"));
    reminder(&mut store, Some(&a), "a1");
    reminder(&mut store, Some(&a), "a2");
    let kept_b = reminder(&mut store, Some(&b), "b1");
    let kept_regular = reminder(&mut store, None, "regular");

    let deleted = store.delete_project(&a, 2).unwrap();
    assert_eq!(deleted.deleted_reminders, 2);
    let workspace = store.workspace().unwrap();
    assert_eq!(
        workspace
            .projects
            .iter()
            .map(|p| p.id.as_str())
            .collect::<Vec<_>>(),
        vec![b.as_str()]
    );
    let mut left: Vec<_> = workspace.reminders.iter().map(|r| r.id.clone()).collect();
    left.sort();
    let mut expected = vec![kept_b, kept_regular];
    expected.sort();
    assert_eq!(left, expected);
}

#[test]
fn stale_confirmation_count_changes_nothing() {
    let mut store = Store::open_in_memory().unwrap();
    let a = project(&mut store, "A");
    reminder(&mut store, Some(&a), "a1");
    let before = store.workspace().unwrap();
    let error = store.delete_project(&a, 0).unwrap_err();
    assert!(matches!(error, Error::Changed { .. }));
    assert!(error.to_string().contains("now has 1 reminder,"));
    assert_eq!(store.workspace().unwrap(), before);
    assert!(matches!(
        store.delete_project(&new_id(), 0),
        Err(Error::NotFound { .. })
    ));
}

#[test]
fn empty_project_deletes_with_zero_count() {
    let mut store = Store::open_in_memory().unwrap();
    let a = project(&mut store, "Empty");
    assert_eq!(store.delete_project(&a, 0).unwrap().deleted_reminders, 0);
    assert!(store.workspace().unwrap().projects.is_empty());
}

#[test]
fn failed_project_delete_rolls_back_child_deletes() {
    let mut store = Store::open_in_memory().unwrap();
    let a = project(&mut store, "A");
    reminder(&mut store, Some(&a), "a1");
    // A trigger that refuses the project row forces a failure after the reminders
    // were already deleted inside the transaction; the rollback must restore them.
    store
        .connection()
        .execute_batch("CREATE TEMP TRIGGER refuse BEFORE DELETE ON projects BEGIN SELECT RAISE(ABORT, 'refused'); END;")
        .unwrap();
    let before = store.workspace().unwrap();
    assert!(matches!(
        store.delete_project(&a, 1),
        Err(Error::Storage(_))
    ));
    assert_eq!(store.workspace().unwrap(), before);
}

#[test]
fn reminder_delete_and_undo_restore_identity_and_completion() {
    let mut store = Store::open_in_memory().unwrap();
    let a = project(&mut store, "A");
    let id = reminder(&mut store, Some(&a), "Keep me");
    let completed = store.set_completed(&id, true).unwrap();

    let removed = store.delete_reminder(&id).unwrap();
    assert_eq!(removed, completed);
    assert!(store.reminder(&id).unwrap().is_none());
    assert!(matches!(
        store.delete_reminder(&id),
        Err(Error::NotFound { .. })
    ));

    let restored = store.restore_reminder(&removed).unwrap();
    assert_eq!(
        (
            &restored.id,
            &restored.project_id,
            &restored.created_at,
            &restored.completed_at
        ),
        (
            &removed.id,
            &removed.project_id,
            &removed.created_at,
            &removed.completed_at
        )
    );
    assert!(
        matches!(store.restore_reminder(&removed), Err(Error::Changed { .. })),
        "double undo must not duplicate"
    );
}

#[test]
fn undo_into_a_deleted_project_is_refused_cleanly() {
    let mut store = Store::open_in_memory().unwrap();
    let a = project(&mut store, "A");
    let id = reminder(&mut store, Some(&a), "Orphan-to-be");
    let removed = store.delete_reminder(&id).unwrap();
    store.delete_project(&a, 0).unwrap();
    assert_eq!(
        store.restore_reminder(&removed).unwrap_err().field(),
        Some(Field::ProjectId)
    );
    assert!(store.workspace().unwrap().reminders.is_empty());
}

#[test]
fn restore_rejects_tampered_snapshots() {
    let mut store = Store::open_in_memory().unwrap();
    let id = reminder(&mut store, None, "Snapshot");
    let removed = store.delete_reminder(&id).unwrap();
    let mut bad = removed.clone();
    bad.created_at = "yesterday".into();
    assert!(store.restore_reminder(&bad).is_err());
    let mut bad = removed.clone();
    bad.title = " ".into();
    assert_eq!(
        store.restore_reminder(&bad).unwrap_err().field(),
        Some(Field::Title)
    );
    let mut bad = removed;
    bad.id = "1 OR 1=1".into();
    assert_eq!(
        store.restore_reminder(&bad).unwrap_err().field(),
        Some(Field::Id)
    );
    assert!(store.workspace().unwrap().reminders.is_empty());
}

#[test]
fn deletions_persist_across_restart() {
    let dir = std::env::temp_dir().join(format!("swish-delete-{}", new_id()));
    let path = dir.join(swish_data::DATABASE_FILE);
    let kept = {
        let mut store = Store::open(&path).unwrap();
        let a = project(&mut store, "Gone");
        reminder(&mut store, Some(&a), "gone too");
        let kept = reminder(&mut store, None, "kept");
        let gone = reminder(&mut store, None, "gone regular");
        store.delete_project(&a, 1).unwrap();
        store.delete_reminder(&gone).unwrap();
        kept
    };
    let store = Store::open(&path).unwrap();
    let workspace = store.workspace().unwrap();
    assert!(workspace.projects.is_empty());
    assert_eq!(
        workspace
            .reminders
            .iter()
            .map(|r| r.id.clone())
            .collect::<Vec<_>>(),
        vec![kept]
    );
    drop(store);
    std::fs::remove_dir_all(dir).unwrap();
}
