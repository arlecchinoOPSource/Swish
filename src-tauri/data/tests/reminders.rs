//! Reminder create/edit/move behaviour. Synthetic data only.

use rusqlite::params;
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

fn reminder(project_id: Option<&str>, title: &str, due: Option<&str>) -> ReminderInput {
    ReminderInput {
        project_id: project_id.map(Into::into),
        title: title.into(),
        text: "Synthetic text".into(),
        due_date: due.map(Into::into),
    }
}

#[test]
fn creates_regular_and_project_reminders_with_one_model() {
    let mut store = Store::open_in_memory().unwrap();
    let p = project(&mut store, "Synthetic project");
    let regular = store
        .create_reminder(&reminder(None, "Regular", None))
        .unwrap();
    let owned = store
        .create_reminder(&reminder(Some(&p), " Owned ", Some("2027-02-01")))
        .unwrap();
    assert_eq!(
        (regular.project_id, regular.due_date, regular.completed_at),
        (None, None, None)
    );
    assert_eq!(owned.project_id.as_deref(), Some(p.as_str()));
    assert_eq!(owned.title, "Owned");
    // Due date after the project deadline is allowed: the dates are independent.
    assert_eq!(owned.due_date.as_deref(), Some("2027-02-01"));
    assert_eq!(store.workspace().unwrap().reminders.len(), 2);
}

#[test]
fn rejects_missing_or_malformed_project_references_without_writing() {
    let mut store = Store::open_in_memory().unwrap();
    assert_eq!(
        store
            .create_reminder(&reminder(Some(&new_id()), "Orphan", None))
            .unwrap_err()
            .field(),
        Some(Field::ProjectId)
    );
    assert_eq!(
        store
            .create_reminder(&reminder(Some("not-an-id"), "Bad", None))
            .unwrap_err()
            .field(),
        Some(Field::ProjectId)
    );
    assert_eq!(
        store
            .create_reminder(&reminder(None, "\n", None))
            .unwrap_err()
            .field(),
        Some(Field::Title)
    );
    assert_eq!(
        store
            .create_reminder(&reminder(None, "Due", Some("2026-11-31")))
            .unwrap_err()
            .field(),
        Some(Field::DueDate)
    );
    assert!(store.workspace().unwrap().reminders.is_empty());
}

#[test]
fn moving_between_contexts_preserves_identity_and_completion() {
    let mut store = Store::open_in_memory().unwrap();
    let (a, b) = (project(&mut store, "A"), project(&mut store, "B"));
    let created = store
        .create_reminder(&reminder(Some(&a), "Travels", Some("2026-12-01")))
        .unwrap();
    // Simulate an existing completion (completion commands arrive separately).
    store
        .connection()
        .execute(
            "UPDATE reminders SET completed_at = ?2 WHERE id = ?1",
            params![created.id, "2026-11-06T12:00:00.000Z"],
        )
        .unwrap();

    let moved = store
        .update_reminder(
            &created.id,
            &reminder(Some(&b), "Travels", Some("2026-12-01")),
        )
        .unwrap();
    assert_eq!(moved.project_id.as_deref(), Some(b.as_str()));
    let regular = store
        .update_reminder(&created.id, &reminder(None, "Travels on", None))
        .unwrap();
    assert_eq!(
        (regular.id.as_str(), regular.created_at.as_str()),
        (created.id.as_str(), created.created_at.as_str())
    );
    assert_eq!(regular.project_id, None);
    assert_eq!(regular.due_date, None);
    assert_eq!(
        regular.completed_at.as_deref(),
        Some("2026-11-06T12:00:00.000Z")
    );
}

#[test]
fn failed_move_leaves_the_reminder_unchanged() {
    let mut store = Store::open_in_memory().unwrap();
    let a = project(&mut store, "A");
    let created = store
        .create_reminder(&reminder(Some(&a), "Stays", None))
        .unwrap();
    assert!(
        store
            .update_reminder(&created.id, &reminder(Some(&new_id()), "Renamed", None))
            .is_err()
    );
    assert_eq!(store.reminder(&created.id).unwrap(), Some(created));
    assert!(matches!(
        store.update_reminder(&new_id(), &reminder(None, "Ghost", None)),
        Err(Error::NotFound { .. })
    ));
}

#[test]
fn reminders_and_moves_survive_restart() {
    let dir = std::env::temp_dir().join(format!("swish-reminders-{}", new_id()));
    let path = dir.join(swish_data::DATABASE_FILE);
    let (id, target) = {
        let mut store = Store::open(&path).unwrap();
        let (a, b) = (project(&mut store, "A"), project(&mut store, "B"));
        let r = store
            .create_reminder(&reminder(Some(&a), "Persisted", Some("2026-12-24")))
            .unwrap();
        store
            .update_reminder(
                &r.id,
                &reminder(Some(&b), "Persisted and moved", Some("2026-12-24")),
            )
            .unwrap();
        store
            .create_reminder(&reminder(None, "Regular", None))
            .unwrap();
        (r.id, b)
    };
    let store = Store::open(&path).unwrap();
    let saved = store.reminder(&id).unwrap().unwrap();
    assert_eq!(
        (
            saved.title.as_str(),
            saved.project_id.as_deref(),
            saved.due_date.as_deref()
        ),
        (
            "Persisted and moved",
            Some(target.as_str()),
            Some("2026-12-24")
        )
    );
    assert_eq!(store.workspace().unwrap().reminders.len(), 2);
    drop(store);
    std::fs::remove_dir_all(dir).unwrap();
}
