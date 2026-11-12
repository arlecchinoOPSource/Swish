//! Project create/edit behaviour. Synthetic data only.

use swish_data::model::new_id;
use swish_data::{Error, Field, ProjectInput, Store};

fn input(name: &str, deadline: &str) -> ProjectInput {
    ProjectInput {
        name: name.into(),
        description: "Synthetic description".into(),
        deadline: deadline.into(),
    }
}

#[test]
fn create_trims_and_returns_the_stored_project() {
    let mut store = Store::open_in_memory().unwrap();
    let project = store
        .create_project(&input("  Garden plan ", "2026-12-24"))
        .unwrap();
    assert_eq!(project.name, "Garden plan");
    assert_eq!(project.deadline, "2026-12-24");
    assert_eq!(project.created_at, project.updated_at);
    assert_eq!(store.workspace().unwrap().projects, vec![project]);
}

#[test]
fn edit_preserves_id_and_creation_time() {
    let mut store = Store::open_in_memory().unwrap();
    let created = store.create_project(&input("Draft", "2026-12-24")).unwrap();
    std::thread::sleep(std::time::Duration::from_millis(5));
    let edited = store
        .update_project(
            &created.id,
            &ProjectInput {
                name: "Final".into(),
                description: String::new(),
                deadline: "2027-01-10".into(),
            },
        )
        .unwrap();
    assert_eq!(
        (edited.id.as_str(), edited.created_at.as_str()),
        (created.id.as_str(), created.created_at.as_str())
    );
    assert_eq!(
        (
            edited.name.as_str(),
            edited.description.as_str(),
            edited.deadline.as_str()
        ),
        ("Final", "", "2027-01-10")
    );
    assert!(edited.updated_at > created.updated_at);
    assert_eq!(store.project(&created.id).unwrap(), Some(edited));
}

#[test]
fn invalid_input_writes_nothing_and_names_the_field() {
    let mut store = Store::open_in_memory().unwrap();
    assert_eq!(
        store
            .create_project(&input(" ", "2026-12-24"))
            .unwrap_err()
            .field(),
        Some(Field::Name)
    );
    assert_eq!(
        store
            .create_project(&input("Plan", ""))
            .unwrap_err()
            .field(),
        Some(Field::Deadline)
    );
    assert!(store.workspace().unwrap().projects.is_empty());

    let created = store.create_project(&input("Plan", "2026-12-24")).unwrap();
    assert_eq!(
        store
            .update_project(&created.id, &input("Plan", "2026-02-30"))
            .unwrap_err()
            .field(),
        Some(Field::Deadline)
    );
    assert_eq!(store.project(&created.id).unwrap(), Some(created));
}

#[test]
fn editing_a_missing_or_malformed_project_fails_cleanly() {
    let mut store = Store::open_in_memory().unwrap();
    assert!(matches!(
        store.update_project(&new_id(), &input("Plan", "2026-12-24")),
        Err(Error::NotFound { .. })
    ));
    assert_eq!(
        store
            .update_project("x' OR 1=1 --", &input("Plan", "2026-12-24"))
            .unwrap_err()
            .field(),
        Some(Field::Id)
    );
}

#[test]
fn quotes_and_sql_text_are_stored_literally() {
    let mut store = Store::open_in_memory().unwrap();
    let name = "Robert'); DROP TABLE projects;--";
    let project = store.create_project(&input(name, "2026-12-24")).unwrap();
    assert_eq!(store.project(&project.id).unwrap().unwrap().name, name);
    assert_eq!(store.workspace().unwrap().projects.len(), 1);
}

#[test]
fn several_projects_survive_restart() {
    let dir = std::env::temp_dir().join(format!("swish-projects-{}", new_id()));
    let path = dir.join(swish_data::DATABASE_FILE);
    let ids: Vec<String> = {
        let mut store = Store::open(&path).unwrap();
        let a = store.create_project(&input("Later", "2027-03-01")).unwrap();
        let b = store
            .create_project(&input("Sooner", "2026-12-01"))
            .unwrap();
        store
            .update_project(&a.id, &input("Later, renamed", "2027-03-01"))
            .unwrap();
        vec![b.id, a.id]
    };
    let store = Store::open(&path).unwrap();
    let projects = store.workspace().unwrap().projects;
    assert_eq!(
        projects.iter().map(|p| p.id.clone()).collect::<Vec<_>>(),
        ids
    );
    assert_eq!(projects[1].name, "Later, renamed");
    drop(store);
    std::fs::remove_dir_all(dir).unwrap();
}

#[test]
fn an_edit_from_a_stale_read_is_refused_and_nothing_is_written() {
    // Two programs (a standalone Swish and the Unhollowed host) share one file: the second editor started from an old read.
    let mut store = Store::open_in_memory().unwrap();
    let created = store.create_project(&input("Draft", "2026-12-24")).unwrap();
    std::thread::sleep(std::time::Duration::from_millis(5));
    let first = store
        .update_project_checked(
            &created.id,
            &input("Edited elsewhere", "2026-12-25"),
            Some(&created.updated_at),
        )
        .unwrap();
    std::thread::sleep(std::time::Duration::from_millis(5));
    let stale = store.update_project_checked(
        &created.id,
        &input("Mine, from the old read", "2027-01-01"),
        Some(&created.updated_at),
    );
    match stale {
        Err(Error::Changed { message }) => {
            assert!(message.contains("changed somewhere else"), "{message}")
        }
        other => panic!("expected a refusal, got {other:?}"),
    }
    assert_eq!(
        store.project(&created.id).unwrap(),
        Some(first.clone()),
        "the other change is intact"
    );
    // Starting again from the newer read works.
    let retried = store
        .update_project_checked(
            &created.id,
            &input("Mine, after reading", "2027-01-01"),
            Some(&first.updated_at),
        )
        .unwrap();
    assert_eq!(retried.name, "Mine, after reading");
}

#[test]
fn an_edit_without_an_earlier_read_keeps_the_old_behaviour_and_a_missing_project_is_still_not_found()
 {
    let mut store = Store::open_in_memory().unwrap();
    let created = store.create_project(&input("Draft", "2026-12-24")).unwrap();
    store
        .update_project(&created.id, &input("One", "2026-12-24"))
        .unwrap();
    let again = store
        .update_project_checked(&created.id, &input("Two", "2026-12-24"), None)
        .unwrap();
    assert_eq!(again.name, "Two");
    let gone = new_id();
    assert!(matches!(
        store.update_project_checked(
            &gone,
            &input("x", "2026-12-24"),
            Some("2026-01-01T00:00:00.000Z")
        ),
        Err(Error::NotFound { entity: "project" })
    ));
}
