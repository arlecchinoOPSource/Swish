//! Completion persistence. Synthetic data only.

use swish_data::model::new_id;
use swish_data::{Error, Field, ProjectInput, ReminderInput, Store};

fn setup(store: &mut Store) -> (String, String) {
    let p = store
        .create_project(&ProjectInput {
            name: "Synthetic".into(),
            description: String::new(),
            deadline: "2026-12-31".into(),
        })
        .unwrap()
        .id;
    let r = store
        .create_reminder(&ReminderInput {
            project_id: Some(p.clone()),
            title: "Check".into(),
            text: String::new(),
            due_date: None,
        })
        .unwrap()
        .id;
    (p, r)
}

#[test]
fn completing_keeps_the_reminder_and_reopening_reverses_it() {
    let mut store = Store::open_in_memory().unwrap();
    let (_, id) = setup(&mut store);
    let done = store.set_completed(&id, true).unwrap();
    assert!(done.completed_at.is_some());
    assert_eq!(
        store.workspace().unwrap().reminders.len(),
        1,
        "completing must not delete"
    );
    let open = store.set_completed(&id, false).unwrap();
    assert_eq!(open.completed_at, None);
    assert_eq!((open.id, open.title), (id, "Check".to_string()));
}

#[test]
fn repeating_a_state_is_idempotent() {
    let mut store = Store::open_in_memory().unwrap();
    let (_, id) = setup(&mut store);
    let first = store.set_completed(&id, true).unwrap();
    std::thread::sleep(std::time::Duration::from_millis(5));
    let again = store.set_completed(&id, true).unwrap();
    assert_eq!(first.completed_at, again.completed_at);
    assert_eq!(first.updated_at, again.updated_at);
    let open = store.set_completed(&id, false).unwrap();
    assert_eq!(store.set_completed(&id, false).unwrap(), open);
}

#[test]
fn editing_content_does_not_change_completion() {
    let mut store = Store::open_in_memory().unwrap();
    let (p, id) = setup(&mut store);
    let done = store.set_completed(&id, true).unwrap();
    let edited = store
        .update_reminder(
            &id,
            &ReminderInput {
                project_id: Some(p),
                title: "Checked".into(),
                text: "more".into(),
                due_date: None,
            },
        )
        .unwrap();
    assert_eq!(edited.completed_at, done.completed_at);
}

#[test]
fn unknown_and_malformed_ids_fail_without_effect() {
    let mut store = Store::open_in_memory().unwrap();
    let (_, id) = setup(&mut store);
    assert!(matches!(
        store.set_completed(&new_id(), true),
        Err(Error::NotFound { .. })
    ));
    assert_eq!(
        store
            .set_completed("1; DELETE FROM reminders", true)
            .unwrap_err()
            .field(),
        Some(Field::Id)
    );
    assert_eq!(store.reminder(&id).unwrap().unwrap().completed_at, None);
}

#[test]
fn completion_survives_restart() {
    let dir = std::env::temp_dir().join(format!("swish-completion-{}", new_id()));
    let path = dir.join(swish_data::DATABASE_FILE);
    let (done_id, open_id, stamp) = {
        let mut store = Store::open(&path).unwrap();
        let (p, a) = setup(&mut store);
        let b = store
            .create_reminder(&ReminderInput {
                project_id: Some(p),
                title: "Reopened".into(),
                text: String::new(),
                due_date: None,
            })
            .unwrap()
            .id;
        let stamp = store.set_completed(&a, true).unwrap().completed_at;
        store.set_completed(&b, true).unwrap();
        store.set_completed(&b, false).unwrap();
        (a, b, stamp)
    };
    let store = Store::open(&path).unwrap();
    assert_eq!(
        store.reminder(&done_id).unwrap().unwrap().completed_at,
        stamp
    );
    assert_eq!(
        store.reminder(&open_id).unwrap().unwrap().completed_at,
        None
    );
    drop(store);
    std::fs::remove_dir_all(dir).unwrap();
}
