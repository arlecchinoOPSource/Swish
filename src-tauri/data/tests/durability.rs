//! Interrupted writes, rapid edits, concurrent writers, and date boundaries.
//! Synthetic data only.

use std::path::{Path, PathBuf};
use std::process::Command;

use swish_data::model::new_id;
use swish_data::{ProjectInput, ReminderInput, Store};

const CHILD_ENV: &str = "SWISH_INTERRUPT_CHILD_DB";

fn temp_path(name: &str) -> (PathBuf, PathBuf) {
    let dir = std::env::temp_dir().join(format!("swish-{name}-{}", new_id()));
    (dir.join(swish_data::DATABASE_FILE), dir)
}

fn project(name: &str, deadline: &str) -> ProjectInput {
    ProjectInput {
        name: name.into(),
        description: String::new(),
        deadline: deadline.into(),
    }
}

/// Runs only as a child process: starts a write and kills the process mid-transaction.
#[test]
fn interrupted_write_child() {
    let Ok(path) = std::env::var(CHILD_ENV) else {
        return;
    };
    let mut store = Store::open(Path::new(&path)).unwrap();
    let _ = store.write(|tx| {
        tx.execute(
            "INSERT INTO projects (id, name, description, deadline, created_at, updated_at) VALUES (?1, 'Half written', '', '2026-12-01', 'x', 'x')",
            [new_id()],
        )?;
        tx.execute("DELETE FROM reminders", [])?;
        // Simulates a crash or power loss before commit.
        std::process::abort();
        #[allow(unreachable_code)]
        Ok(())
    });
}

#[test]
fn a_crash_mid_transaction_leaves_the_last_committed_state() {
    let (path, dir) = temp_path("interrupt");
    let before = {
        let mut store = Store::open(&path).unwrap();
        let p = store
            .create_project(&project("Committed", "2026-12-01"))
            .unwrap();
        store
            .create_reminder(&ReminderInput {
                project_id: Some(p.id),
                title: "Committed child".into(),
                text: String::new(),
                due_date: None,
            })
            .unwrap();
        store.workspace().unwrap()
    };
    let status = Command::new(std::env::current_exe().unwrap())
        .args([
            "--exact",
            "interrupted_write_child",
            "--nocapture",
            "--test-threads=1",
        ])
        .env(CHILD_ENV, &path)
        .status()
        .unwrap();
    assert!(!status.success(), "the child must die mid-write");

    let store = Store::open(&path).unwrap();
    assert_eq!(store.workspace().unwrap(), before);
    let integrity: String = store
        .connection()
        .query_row("PRAGMA integrity_check", [], |r| r.get(0))
        .unwrap();
    assert_eq!(integrity, "ok");
    drop(store);
    std::fs::remove_dir_all(dir).unwrap();
}

#[test]
fn rapid_edits_land_in_order_and_survive_restart() {
    let (path, dir) = temp_path("rapid");
    let id = {
        let mut store = Store::open(&path).unwrap();
        let r = store
            .create_reminder(&ReminderInput {
                project_id: None,
                title: "v0".into(),
                text: String::new(),
                due_date: None,
            })
            .unwrap();
        for i in 1..=200 {
            store
                .update_reminder(
                    &r.id,
                    &ReminderInput {
                        project_id: None,
                        title: format!("v{i}"),
                        text: String::new(),
                        due_date: None,
                    },
                )
                .unwrap();
            store.set_completed(&r.id, i % 2 == 0).unwrap();
        }
        r.id
    };
    let store = Store::open(&path).unwrap();
    let r = store.reminder(&id).unwrap().unwrap();
    assert_eq!(r.title, "v200");
    assert!(r.completed_at.is_some());
    drop(store);
    std::fs::remove_dir_all(dir).unwrap();
}

#[test]
fn two_connections_writing_at_once_serialize_without_loss() {
    let (path, dir) = temp_path("concurrent");
    drop(Store::open(&path).unwrap());
    let writers: Vec<_> = (0..2)
        .map(|n| {
            let path = path.clone();
            std::thread::spawn(move || {
                let mut store = Store::open(&path).unwrap();
                for i in 0..50 {
                    store
                        .create_project(&project(&format!("writer {n} item {i}"), "2026-12-01"))
                        .unwrap();
                }
            })
        })
        .collect();
    for writer in writers {
        writer.join().unwrap();
    }
    assert_eq!(
        Store::open(&path)
            .unwrap()
            .workspace()
            .unwrap()
            .projects
            .len(),
        100
    );
    std::fs::remove_dir_all(dir).unwrap();
}

#[test]
fn boundary_dates_are_stored_exactly() {
    let mut store = Store::open_in_memory().unwrap();
    // Leap day, DST changes in several regions, year ends, and the extremes allowed.
    for date in [
        "2028-02-29",
        "2026-03-08",
        "2026-03-29",
        "2026-10-25",
        "2026-11-01",
        "2026-12-31",
        "2027-01-01",
        "1000-01-01",
        "9999-12-31",
    ] {
        let p = store.create_project(&project(date, date)).unwrap();
        assert_eq!(store.project(&p.id).unwrap().unwrap().deadline, date);
    }
    assert!(store.create_project(&project("bad", "2027-02-29")).is_err());
}
