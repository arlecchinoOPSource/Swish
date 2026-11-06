//! The shared project/reminder domain. One reminder model serves both contexts:
//! `project_id: None` is a regular reminder, `Some(id)` belongs to that project.

use serde::{Deserialize, Serialize};

use crate::date::is_calendar_date;
use crate::error::{Error, Field};

pub const NAME_MAX: usize = 200;
pub const TITLE_MAX: usize = 200;
pub const BODY_MAX: usize = 10_000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: String,
    /// Date-only `YYYY-MM-DD`; independent of every reminder due date.
    pub deadline: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Reminder {
    pub id: String,
    pub project_id: Option<String>,
    pub title: String,
    pub text: String,
    /// Optional date-only `YYYY-MM-DD`.
    pub due_date: Option<String>,
    /// When the reminder was completed; `None` while open. Completing never deletes.
    pub completed_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Everything the canvas renders, in stable display order.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub projects: Vec<Project>,
    pub reminders: Vec<Reminder>,
}

/// Untrusted project fields from the frontend.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectInput {
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub deadline: String,
}

/// Untrusted reminder fields from the frontend.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReminderInput {
    #[serde(default)]
    pub project_id: Option<String>,
    pub title: String,
    #[serde(default)]
    pub text: String,
    #[serde(default)]
    pub due_date: Option<String>,
}

/// Project fields after boundary validation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidProject {
    pub name: String,
    pub description: String,
    pub deadline: String,
}

/// Reminder fields after boundary validation. The project reference is checked
/// separately against storage, inside the writing transaction.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidReminder {
    pub project_id: Option<String>,
    pub title: String,
    pub text: String,
    pub due_date: Option<String>,
}

fn required_line(value: &str, field: Field, max: usize) -> Result<String, Error> {
    let value = value.trim();
    if value.is_empty() {
        return Err(Error::invalid(field, "is required"));
    }
    if value.contains(['\n', '\r']) {
        return Err(Error::invalid(field, "must be a single line"));
    }
    limit(value, field, max)
}

fn limit(value: &str, field: Field, max: usize) -> Result<String, Error> {
    if value.chars().count() > max {
        return Err(Error::invalid(
            field,
            &format!("must be {max} characters or fewer"),
        ));
    }
    if value
        .chars()
        .any(|c| c.is_control() && c != '\n' && c != '\t')
    {
        return Err(Error::invalid(
            field,
            "contains unsupported control characters",
        ));
    }
    Ok(value.to_owned())
}

fn body(value: &str, field: Field) -> Result<String, Error> {
    // Keep interior formatting; drop only surrounding blank space. Normalise line endings.
    limit(value.replace("\r\n", "\n").trim(), field, BODY_MAX)
}

fn calendar_date(value: &str, field: Field) -> Result<String, Error> {
    if is_calendar_date(value) {
        Ok(value.to_owned())
    } else {
        Err(Error::invalid(
            field,
            "must be a real date written as YYYY-MM-DD",
        ))
    }
}

/// Accepts a well-formed stable ID (lowercase hyphenated UUID).
pub fn validate_id(value: &str, field: Field) -> Result<String, Error> {
    match uuid::Uuid::try_parse(value) {
        Ok(id) if id.hyphenated().to_string() == value => Ok(value.to_owned()),
        _ => Err(Error::invalid(field, "is not a valid identifier")),
    }
}

impl ProjectInput {
    pub fn validate(&self) -> Result<ValidProject, Error> {
        Ok(ValidProject {
            name: required_line(&self.name, Field::Name, NAME_MAX)?,
            description: body(&self.description, Field::Description)?,
            deadline: calendar_date(self.deadline.trim(), Field::Deadline)?,
        })
    }
}

impl ReminderInput {
    pub fn validate(&self) -> Result<ValidReminder, Error> {
        let due_date = match self.due_date.as_deref().map(str::trim) {
            None | Some("") => None,
            Some(date) => Some(calendar_date(date, Field::DueDate)?),
        };
        let project_id = match self.project_id.as_deref() {
            None | Some("") => None,
            Some(id) => Some(validate_id(id, Field::ProjectId)?),
        };
        Ok(ValidReminder {
            project_id,
            title: required_line(&self.title, Field::Title, TITLE_MAX)?,
            text: body(&self.text, Field::Text)?,
            due_date,
        })
    }
}

pub fn new_id() -> String {
    uuid::Uuid::new_v4().hyphenated().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn project(name: &str, deadline: &str) -> ProjectInput {
        ProjectInput {
            name: name.into(),
            description: String::new(),
            deadline: deadline.into(),
        }
    }

    #[test]
    fn project_requires_trimmed_single_line_name_and_real_deadline() {
        let valid = project("  Launch  ", "2026-11-30").validate().unwrap();
        assert_eq!(valid.name, "Launch");
        assert_eq!(valid.deadline, "2026-11-30");
        assert_eq!(
            project("   ", "2026-11-30").validate().unwrap_err().field(),
            Some(Field::Name)
        );
        assert_eq!(
            project("a\nb", "2026-11-30")
                .validate()
                .unwrap_err()
                .field(),
            Some(Field::Name)
        );
        assert_eq!(
            project("Launch", "").validate().unwrap_err().field(),
            Some(Field::Deadline)
        );
        assert_eq!(
            project("Launch", "2026-02-30")
                .validate()
                .unwrap_err()
                .field(),
            Some(Field::Deadline)
        );
        assert_eq!(
            project(&"x".repeat(NAME_MAX + 1), "2026-11-30")
                .validate()
                .unwrap_err()
                .field(),
            Some(Field::Name)
        );
        assert!(
            project(&"é".repeat(NAME_MAX), "2026-11-30")
                .validate()
                .is_ok()
        );
    }

    #[test]
    fn reminder_due_date_and_project_are_optional_but_validated() {
        let input = ReminderInput {
            project_id: None,
            title: "Call".into(),
            text: "  line one\r\nline two  ".into(),
            due_date: Some(String::new()),
        };
        let valid = input.validate().unwrap();
        assert_eq!(
            (valid.project_id, valid.due_date, valid.text.as_str()),
            (None, None, "line one\nline two")
        );
        let bad_project = ReminderInput {
            project_id: Some("../etc".into()),
            ..input.clone()
        };
        assert_eq!(
            bad_project.validate().unwrap_err().field(),
            Some(Field::ProjectId)
        );
        let bad_date = ReminderInput {
            due_date: Some("tomorrow".into()),
            ..input.clone()
        };
        assert_eq!(
            bad_date.validate().unwrap_err().field(),
            Some(Field::DueDate)
        );
        let control = ReminderInput {
            text: "bell\u{7}".into(),
            ..input
        };
        assert_eq!(control.validate().unwrap_err().field(), Some(Field::Text));
    }

    #[test]
    fn ids_are_canonical_uuids() {
        let id = new_id();
        assert_eq!(validate_id(&id, Field::Id).unwrap(), id);
        assert!(validate_id(&id.to_uppercase(), Field::Id).is_err());
        assert!(validate_id("1", Field::Id).is_err());
    }

    #[test]
    fn input_rejects_unknown_fields() {
        let parsed: Result<ProjectInput, _> =
            serde_json::from_str(r#"{"name":"A","deadline":"2026-11-30","id":"x"}"#);
        assert!(parsed.is_err());
    }
}
