//! Schema, constraint, migration, and transaction tests. Synthetic data only.

use rusqlite::{Connection, params};
use swish_data::date::now_timestamp;
use swish_data::migrations::{self, APPLICATION_ID};
use swish_data::model::new_id;
use swish_data::{Error, Store};

fn temp_db(name: &str) -> (std::path::PathBuf, impl Drop) {
    struct Cleanup(std::path::PathBuf);
    impl Drop for Cleanup {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }
    let dir = std::env::temp_dir().join(format!("swish-test-{name}-{}", new_id()));
    (
        dir.join("nested").join(swish_data::DATABASE_FILE),
        Cleanup(dir),
    )
}

fn insert_project(conn: &Connection, id: &str, deadline: &str) -> rusqlite::Result<usize> {
    let now = now_timestamp();
    conn.execute(
        "INSERT INTO projects (id, name, description, deadline, created_at, updated_at) VALUES (?1, 'Synthetic project', '', ?2, ?3, ?3)",
        params![id, deadline, now],
    )
}

fn insert_reminder(
    conn: &Connection,
    id: &str,
    project: Option<&str>,
    due: Option<&str>,
) -> rusqlite::Result<usize> {
    let now = now_timestamp();
    conn.execute(
        "INSERT INTO reminders (id, project_id, title, text, due_date, completed_at, created_at, updated_at) VALUES (?1, ?2, 'Synthetic reminder', '', ?3, NULL, ?4, ?4)",
        params![id, project, due, now],
    )
}

#[test]
fn fresh_file_migrates_to_latest_and_reopens_without_changes() {
    let (path, _cleanup) = temp_db("fresh");
    let store = Store::open(&path).unwrap();
    assert_eq!(
        store.schema_version().unwrap(),
        migrations::latest_version()
    );
    let app_id: i64 = store
        .connection()
        .pragma_query_value(None, "application_id", |r| r.get(0))
        .unwrap();
    assert_eq!(app_id, APPLICATION_ID);
    let project = new_id();
    insert_project(store.connection(), &project, "2026-12-01").unwrap();
    drop(store);

    let reopened = Store::open(&path).unwrap();
    assert_eq!(
        reopened.schema_version().unwrap(),
        migrations::latest_version()
    );
    let workspace = reopened.workspace().unwrap();
    assert_eq!(workspace.projects.len(), 1);
    assert_eq!(workspace.projects[0].id, project);
}

#[test]
fn every_migration_step_applies_in_order_from_an_empty_file() {
    let mut conn = Connection::open_in_memory().unwrap();
    for target in 0..=migrations::latest_version() {
        assert_eq!(migrations::migrate_to(&mut conn, target).unwrap(), target);
    }
    // Idempotent once current.
    assert_eq!(
        migrations::migrate(&mut conn).unwrap(),
        migrations::latest_version()
    );
}

#[test]
fn newer_schema_is_refused_instead_of_downgraded() {
    let (path, _cleanup) = temp_db("newer");
    drop(Store::open(&path).unwrap());
    let conn = Connection::open(&path).unwrap();
    conn.pragma_update(None, "user_version", migrations::latest_version() + 1)
        .unwrap();
    drop(conn);
    match Store::open(&path) {
        Err(Error::SchemaTooNew { found, supported }) => {
            assert_eq!(
                (found, supported),
                (
                    migrations::latest_version() + 1,
                    migrations::latest_version()
                )
            )
        }
        other => panic!("expected SchemaTooNew, got {:?}", other.err()),
    }
}

#[test]
fn refused_files_are_left_byte_for_byte_unchanged() {
    let (path, _cleanup) = temp_db("untouched");
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    type Make = Box<dyn Fn(&std::path::Path)>;
    let cases: [(&str, Make); 3] = [
        (
            "foreign",
            Box::new(|p| {
                Connection::open(p)
                    .unwrap()
                    .execute_batch("CREATE TABLE journal (body TEXT);")
                    .unwrap()
            }),
        ),
        (
            "newer",
            Box::new(|p| {
                Connection::open(p)
                    .unwrap()
                    .execute_batch(&format!(
                        "PRAGMA application_id = {APPLICATION_ID}; PRAGMA user_version = 99;"
                    ))
                    .unwrap()
            }),
        ),
        (
            "corrupt",
            Box::new(|p| std::fs::write(p, b"this is not a database ".repeat(400)).unwrap()),
        ),
    ];
    for (name, make) in cases {
        let _ = std::fs::remove_file(&path);
        make(&path);
        let before = std::fs::read(&path).unwrap();
        assert!(Store::open(&path).is_err(), "{name} must be refused");
        assert_eq!(
            std::fs::read(&path).unwrap(),
            before,
            "{name} file was modified"
        );
        let dir = path.parent().unwrap();
        let extra: Vec<_> = std::fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().file_name())
            .filter(|n| n != swish_data::DATABASE_FILE)
            .collect();
        assert!(extra.is_empty(), "{name} left {extra:?}");
    }
}

#[test]
fn another_applications_database_is_never_adopted() {
    let (path, _cleanup) = temp_db("foreign");
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    let conn = Connection::open(&path).unwrap();
    conn.execute_batch("CREATE TABLE journal (body TEXT);")
        .unwrap();
    drop(conn);
    assert!(matches!(Store::open(&path), Err(Error::ForeignDatabase)));
    let conn = Connection::open(&path).unwrap();
    let tables: i64 = conn
        .query_row(
            "SELECT count(*) FROM sqlite_schema WHERE name = 'projects'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(tables, 0, "a foreign file must not be modified");
}

#[test]
fn foreign_keys_reject_orphans_and_cascade_only_through_projects() {
    let store = Store::open_in_memory().unwrap();
    let conn = store.connection();
    assert!(
        insert_reminder(conn, &new_id(), Some(&new_id()), None).is_err(),
        "orphan reminder accepted"
    );

    let project = new_id();
    insert_project(conn, &project, "2026-12-01").unwrap();
    let owned = new_id();
    let regular = new_id();
    insert_reminder(conn, &owned, Some(&project), Some("2026-11-20")).unwrap();
    insert_reminder(conn, &regular, None, None).unwrap();
    assert!(
        conn.execute(
            "UPDATE projects SET id = ?1 WHERE id = ?2",
            params![new_id(), project]
        )
        .is_err(),
        "project IDs must be stable"
    );

    conn.execute("DELETE FROM projects WHERE id = ?1", [&project])
        .unwrap();
    let remaining: Vec<String> = conn
        .prepare("SELECT id FROM reminders")
        .unwrap()
        .query_map([], |r| r.get(0))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap();
    assert_eq!(remaining, vec![regular]);
}

#[test]
fn constraints_reject_blank_names_and_non_date_values() {
    let store = Store::open_in_memory().unwrap();
    let conn = store.connection();
    assert!(insert_project(conn, &new_id(), "2026-12-01T00:00:00Z").is_err());
    assert!(insert_project(conn, &new_id(), "12/01/2026").is_err());
    assert!(insert_project(conn, "short-id", "2026-12-01").is_err());
    assert!(
        conn.execute(
            "INSERT INTO projects (id, name, description, deadline, created_at, updated_at) VALUES (?1, '   ', '', '2026-12-01', 'x', 'x')",
            [new_id()],
        )
        .is_err()
    );
    let project = new_id();
    insert_project(conn, &project, "2026-12-01").unwrap();
    assert!(insert_reminder(conn, &new_id(), Some(&project), Some("2026-11-20 09:00")).is_err());
    // STRICT tables refuse values that cannot be stored as TEXT.
    insert_reminder(conn, &new_id(), None, None).unwrap();
    assert!(
        conn.execute("UPDATE reminders SET created_at = X'00'", [])
            .is_err()
    );
}

#[test]
fn date_only_values_round_trip_without_timezone_shift() {
    let store = Store::open_in_memory().unwrap();
    let project = new_id();
    insert_project(store.connection(), &project, "2026-03-29").unwrap();
    insert_reminder(
        store.connection(),
        &new_id(),
        Some(&project),
        Some("2026-10-25"),
    )
    .unwrap();
    insert_reminder(store.connection(), &new_id(), None, None).unwrap();
    let workspace = store.workspace().unwrap();
    assert_eq!(workspace.projects[0].deadline, "2026-03-29");
    let dues: Vec<_> = workspace
        .reminders
        .iter()
        .map(|r| r.due_date.clone())
        .collect();
    assert!(dues.contains(&Some("2026-10-25".into())) && dues.contains(&None));
    // Independent dates: a reminder may be due after its project's deadline.
    insert_reminder(
        store.connection(),
        &new_id(),
        Some(&project),
        Some("2027-01-01"),
    )
    .unwrap();
}

#[test]
fn failed_write_rolls_back_every_statement() {
    let mut store = Store::open_in_memory().unwrap();
    let project = new_id();
    let result = store.write(|tx| {
        insert_project(tx, &project, "2026-12-01")?;
        insert_reminder(tx, &new_id(), Some(&project), None)?;
        // Fails: orphan reference. The project above must not survive.
        insert_reminder(tx, &new_id(), Some(&new_id()), None)?;
        Ok(())
    });
    assert!(matches!(result, Err(Error::Storage(_))));
    assert_eq!(store.workspace().unwrap(), Default::default());

    store
        .write(|tx| Ok(insert_project(tx, &project, "2026-12-01")?))
        .unwrap();
    assert_eq!(store.workspace().unwrap().projects.len(), 1);
}

#[test]
fn projects_list_by_deadline_and_serialize_in_camel_case() {
    let store = Store::open_in_memory().unwrap();
    let (late, early) = (new_id(), new_id());
    insert_project(store.connection(), &late, "2027-01-15").unwrap();
    insert_project(store.connection(), &early, "2026-12-01").unwrap();
    let workspace = store.workspace().unwrap();
    assert_eq!(
        workspace
            .projects
            .iter()
            .map(|p| p.id.as_str())
            .collect::<Vec<_>>(),
        vec![early.as_str(), late.as_str()]
    );
    let json = serde_json::to_value(&workspace).unwrap();
    assert!(json["projects"][0].get("createdAt").is_some());
    insert_reminder(store.connection(), &new_id(), None, None).unwrap();
    let json = serde_json::to_value(store.workspace().unwrap()).unwrap();
    assert_eq!(json["reminders"][0]["projectId"], serde_json::Value::Null);
    assert_eq!(json["reminders"][0]["completedAt"], serde_json::Value::Null);
}

#[test]
fn errors_serialize_without_internal_details() {
    let api: swish_data::ApiError = Error::Storage(rusqlite::Error::InvalidQuery).into();
    let json = serde_json::to_value(api).unwrap();
    assert_eq!(json["code"], "storage");
    assert!(json.get("field").is_none());
    assert!(!json["message"].as_str().unwrap().contains("Invalid"));
}
