//! Backup export/validation/restore. Synthetic fixtures only.

use serde_json::{Value, json};
use swish_data::backup::{self, BACKUP_FORMAT, Backup, parse_backup};
use swish_data::model::new_id;
use swish_data::{Error, ProjectInput, ReminderInput, Store};

fn seeded() -> Store {
    let mut store = Store::open_in_memory().unwrap();
    let p = store
        .create_project(&ProjectInput {
            name: "Synthetic tour".into(),
            description: "Line one\nLine two".into(),
            deadline: "2026-12-31".into(),
        })
        .unwrap();
    let r = store
        .create_reminder(&ReminderInput {
            project_id: Some(p.id.clone()),
            title: "Book venue".into(),
            text: "Café ✓".into(),
            due_date: Some("2027-01-05".into()),
        })
        .unwrap();
    store.set_completed(&r.id, true).unwrap();
    store
        .create_reminder(&ReminderInput {
            project_id: None,
            title: "Regular".into(),
            text: String::new(),
            due_date: None,
        })
        .unwrap();
    store
}

fn exported() -> Value {
    serde_json::from_str(&seeded().export_backup().unwrap().to_json()).unwrap()
}

fn rejects(value: &Value, needle: &str) {
    match parse_backup(&value.to_string()) {
        Err(Error::InvalidBackup { message }) => assert!(
            message.contains(needle),
            "{message:?} should mention {needle:?}"
        ),
        other => panic!("expected InvalidBackup mentioning {needle:?}, got {other:?}"),
    }
}

#[test]
fn export_then_restore_reproduces_everything_exactly() {
    let mut source = seeded();
    let original = source.workspace().unwrap();
    let text = source.export_backup().unwrap().to_json();
    let valid = parse_backup(&text).unwrap();
    assert_eq!(valid.backup().format, BACKUP_FORMAT);

    let mut target = Store::open_in_memory().unwrap();
    target
        .create_project(&ProjectInput {
            name: "To be replaced".into(),
            description: String::new(),
            deadline: "2026-01-01".into(),
        })
        .unwrap();
    let counts = target.restore_backup(&valid).unwrap();
    assert_eq!((counts.projects, counts.reminders), (1, 2));
    assert_eq!(
        target.workspace().unwrap(),
        original,
        "IDs, timestamps, completion, and text must round-trip"
    );
}

#[test]
fn malformed_and_foreign_files_are_rejected_with_clear_messages() {
    for (text, needle) in [
        ("", "not a readable Swish backup"),
        ("{ not json", "not a readable Swish backup"),
        ("[]", "not a readable Swish backup"),
        (r#"{"hello":"world"}"#, "not a Swish backup"),
        (
            r#"{"format":"ember-journal","version":1}"#,
            "not a Swish backup",
        ),
    ] {
        match parse_backup(text) {
            Err(Error::InvalidBackup { message }) => {
                assert!(message.contains(needle), "{text:?}: {message}")
            }
            other => panic!("{text:?} gave {other:?}"),
        }
    }
}

#[test]
fn version_checks_cover_newer_older_and_schema() {
    let mut v = exported();
    v["version"] = json!(2);
    rejects(&v, "newer version of Swish");
    v["version"] = json!(0);
    rejects(&v, "not supported");
    let mut v = exported();
    v["version"] = Value::Null;
    rejects(&v, "not supported");
    let mut v = exported();
    v["schemaVersion"] = json!(99);
    rejects(&v, "schema 99");
}

#[test]
fn structural_damage_is_rejected() {
    let mut v = exported();
    v.as_object_mut().unwrap().remove("reminders");
    rejects(&v, "damaged or incomplete");
    let mut v = exported();
    v["projects"][0]["secret"] = json!("extra");
    rejects(&v, "damaged or incomplete");
    let mut v = exported();
    v["projects"][0]["name"] = json!(42);
    rejects(&v, "damaged or incomplete");
}

#[test]
fn duplicate_ids_and_dangling_references_are_rejected() {
    let mut v = exported();
    let copy = v["projects"][0].clone();
    v["projects"].as_array_mut().unwrap().push(copy);
    rejects(&v, "repeats an identifier");
    let mut v = exported();
    let copy = v["reminders"][0].clone();
    v["reminders"].as_array_mut().unwrap().push(copy);
    rejects(&v, "repeats an identifier");
    let mut v = exported();
    v["reminders"][0]["projectId"] = json!(new_id());
    rejects(&v, "not in the backup");
    let mut v = exported();
    v["reminders"][1]["id"] = json!("R1");
    rejects(&v, "invalid identifier");
}

#[test]
fn field_rules_match_normal_editing() {
    let mut v = exported();
    v["projects"][0]["deadline"] = json!("2026-02-30");
    rejects(&v, "Project 1 is invalid: Deadline");
    let mut v = exported();
    v["reminders"][0]["title"] = json!("   ");
    rejects(&v, "Reminder 1 is invalid: Reminder header");
    let mut v = exported();
    v["reminders"][0]["completedAt"] = json!("yesterday");
    rejects(&v, "unreadable timestamp");
    let mut v = exported();
    v["exportedAt"] = json!("2026-11-06");
    rejects(&v, "export time");
}

#[test]
fn a_failed_restore_rolls_back_to_the_previous_data() {
    let valid = parse_backup(&seeded().export_backup().unwrap().to_json()).unwrap();
    let mut target = Store::open_in_memory().unwrap();
    target
        .create_project(&ProjectInput {
            name: "Keep me".into(),
            description: String::new(),
            deadline: "2026-01-01".into(),
        })
        .unwrap();
    let before = target.workspace().unwrap();
    // Force a failure after the existing rows were already deleted inside the transaction.
    target.connection().execute_batch("CREATE TEMP TRIGGER refuse BEFORE INSERT ON reminders BEGIN SELECT RAISE(ABORT, 'refused'); END;").unwrap();
    assert!(matches!(
        target.restore_backup(&valid),
        Err(Error::Storage(_))
    ));
    assert_eq!(target.workspace().unwrap(), before);
}

#[test]
fn validating_without_restoring_changes_nothing() {
    // The "cancel" path: a file is inspected, then the user cancels.
    let mut store = seeded();
    let before = store.workspace().unwrap();
    let other = Store::open_in_memory().unwrap().workspace().unwrap();
    let _inspected = parse_backup(
        &Store::open_in_memory()
            .unwrap()
            .export_backup()
            .unwrap()
            .to_json(),
    )
    .unwrap();
    assert_ne!(before, other);
    assert_eq!(store.workspace().unwrap(), before);
    assert_eq!(store.counts().unwrap().reminders, 2);
    let _ = store.export_backup().unwrap();
}

#[test]
fn safety_copies_are_written_atomically_pruned_and_restorable() {
    let dir = std::env::temp_dir().join(format!("swish-backups-{}", new_id()));
    let mut store = seeded();
    let mut last = None;
    for i in 0..7 {
        let mut b: Backup = store.export_backup().unwrap();
        b.exported_at = format!("2026-11-06T10:00:0{i}.000Z");
        last = Some(backup::write_safety_copy(&dir, &b).unwrap());
    }
    let names: Vec<String> = std::fs::read_dir(&dir)
        .unwrap()
        .map(|e| e.unwrap().file_name().into_string().unwrap())
        .collect();
    assert_eq!(names.len(), backup::SAFETY_COPIES_KEPT, "{names:?}");
    assert!(names.iter().all(|n| !n.ends_with(".partial")));

    // Undo of a restore = restoring the safety copy.
    let before = store.workspace().unwrap();
    let empty = parse_backup(
        &Store::open_in_memory()
            .unwrap()
            .export_backup()
            .unwrap()
            .to_json(),
    )
    .unwrap();
    store.restore_backup(&empty).unwrap();
    assert!(store.workspace().unwrap().projects.is_empty());
    let safety = backup::read_backup_file(&last.unwrap()).unwrap();
    store.restore_backup(&safety).unwrap();
    assert_eq!(store.workspace().unwrap(), before);
    std::fs::remove_dir_all(dir).unwrap();
}

#[test]
fn oversized_files_are_refused_before_parsing() {
    let dir = std::env::temp_dir().join(format!("swish-big-{}", new_id()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("big.json");
    std::fs::write(&path, vec![b' '; (backup::MAX_BACKUP_BYTES + 1) as usize]).unwrap();
    assert!(matches!(
        backup::read_backup_file(&path),
        Err(Error::InvalidBackup { .. })
    ));
    std::fs::remove_dir_all(dir).unwrap();
    assert_eq!(
        backup::suggested_file_name("2026-11-06T10:00:00.000Z"),
        "swish-backup-2026-11-06.json"
    );
}

#[cfg(unix)]
#[test]
fn restore_safety_copies_are_owner_only() {
    use std::os::unix::fs::PermissionsExt;
    let dir = std::env::temp_dir().join(format!("swish-private-copy-{}", new_id()));
    let mut store = Store::open_in_memory().unwrap();
    let copy =
        backup::write_safety_copy(&dir.join("backups"), &store.export_backup().unwrap()).unwrap();
    let mode = |p: &std::path::Path| std::fs::metadata(p).unwrap().permissions().mode() & 0o777;
    assert_eq!(mode(&copy), 0o600);
    assert_eq!(mode(&dir.join("backups")), 0o700);
    let _ = std::fs::remove_dir_all(&dir);
}
