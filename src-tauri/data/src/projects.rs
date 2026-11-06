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
        let id = validate_id(id, Field::Id)?;
        let valid = input.validate()?;
        let now = now_timestamp();
        self.write(|tx| {
            let changed = tx.execute(
                "UPDATE projects SET name = ?2, description = ?3, deadline = ?4, updated_at = ?5 WHERE id = ?1",
                params![id, valid.name, valid.description, valid.deadline, now],
            )?;
            if changed == 0 {
                return Err(Error::NotFound { entity: "project" });
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
