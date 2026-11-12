//! Project create/edit. IDs and creation times never change after creation.

use rusqlite::{OptionalExtension, params};

use crate::date::now_timestamp;
use crate::error::{Error, Field};
use crate::model::{Project, ProjectInput, new_id, validate_id};
use crate::store::{PROJECT_COLUMNS, Store, project_from_row};

impl Store {
    pub fn create_project(&mut self, input: &ProjectInput) -> Result<Project, Error> {
        let valid = input.validate()?;
        let now = now_timestamp();
        let project = Project {
            id: new_id(),
            name: valid.name,
            description: valid.description,
            deadline: valid.deadline,
            created_at: now.clone(),
            updated_at: now,
        };
        self.write(|tx| {
            tx.execute(
                "INSERT INTO projects (id, name, description, deadline, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![project.id, project.name, project.description, project.deadline, project.created_at, project.updated_at],
            )?;
            Ok(())
        })?;
        Ok(project)
    }

    pub fn update_project(&mut self, id: &str, input: &ProjectInput) -> Result<Project, Error> {
        self.update_project_checked(id, input, None)
    }

    /// Like `update_project`, but when `expected_updated_at` is given the edit applies only if the project still has that
    /// `updated_at`, i.e. nobody (another Swish window, or the Unhollowed host) changed it since the caller read it.
    /// Otherwise nothing is written and `Error::Changed` says so. `None` keeps the old last-write-wins behaviour for
    /// callers that have no earlier read.
    pub fn update_project_checked(
        &mut self,
        id: &str,
        input: &ProjectInput,
        expected_updated_at: Option<&str>,
    ) -> Result<Project, Error> {
        let id = validate_id(id, Field::Id)?;
        let valid = input.validate()?;
        let now = now_timestamp();
        self.write(|tx| {
            let changed = tx.execute(
                "UPDATE projects SET name = ?2, description = ?3, deadline = ?4, updated_at = ?5 WHERE id = ?1 AND (?6 IS NULL OR updated_at = ?6)",
                params![id, valid.name, valid.description, valid.deadline, now, expected_updated_at],
            )?;
            if changed == 0 {
                return Err(missing_or_changed(tx, "projects", "project", &id)?);
            }
            Ok(tx.query_row(
                &format!("SELECT {PROJECT_COLUMNS} FROM projects WHERE id = ?1"),
                [&id],
                project_from_row,
            )?)
        })
    }

    pub fn project(&self, id: &str) -> Result<Option<Project>, Error> {
        Ok(self
            .connection()
            .query_row(
                &format!("SELECT {PROJECT_COLUMNS} FROM projects WHERE id = ?1"),
                [id],
                project_from_row,
            )
            .optional()?)
    }
}

/// Why an update matched no row: the row is gone, or it was changed after the caller read it.
pub(crate) fn missing_or_changed(
    tx: &rusqlite::Transaction<'_>,
    table: &str,
    entity: &'static str,
    id: &str,
) -> Result<Error, Error> {
    let exists: bool = tx.query_row(
        &format!("SELECT EXISTS (SELECT 1 FROM {table} WHERE id = ?1)"),
        [id],
        |row| row.get(0),
    )?;
    Ok(if exists {
        Error::Changed {
            message: format!(
                "That {entity} was changed somewhere else after you opened it. Nothing was saved over it and your edits are still here; saving again replaces the other change."
            ),
        }
    } else {
        Error::NotFound { entity }
    })
}
