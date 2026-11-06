use serde::Serialize;
use std::fmt;

/// Input fields that can fail validation, named as the frontend names them.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Field {
    Id,
    Name,
    Description,
    Deadline,
    ProjectId,
    Title,
    Text,
    DueDate,
}

/// Errors returned to the frontend. Messages are safe to display and never include
/// file paths, SQL, or stored content.
#[derive(Debug)]
pub enum Error {
    Invalid {
        field: Field,
        message: String,
    },
    NotFound {
        entity: &'static str,
    },
    /// Stored data no longer matches what the user confirmed; nothing was changed.
    Changed {
        message: String,
    },
    /// The file was written by a newer Swish; refuse rather than corrupt it.
    SchemaTooNew {
        found: i64,
        supported: i64,
    },
    /// The file is a SQLite database that belongs to another application.
    ForeignDatabase,
    Storage(rusqlite::Error),
    Io(std::io::Error),
}

impl Error {
    pub fn invalid(field: Field, message: &str) -> Self {
        Error::Invalid {
            field,
            message: message.to_owned(),
        }
    }

    pub fn field(&self) -> Option<Field> {
        match self {
            Error::Invalid { field, .. } => Some(*field),
            _ => None,
        }
    }

    pub fn code(&self) -> &'static str {
        match self {
            Error::Invalid { .. } => "invalid",
            Error::NotFound { .. } => "notFound",
            Error::Changed { .. } => "changed",
            Error::SchemaTooNew { .. } => "schemaTooNew",
            Error::ForeignDatabase => "foreignDatabase",
            Error::Storage(_) | Error::Io(_) => "storage",
        }
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::Invalid { field, message } => {
                let label = match field {
                    Field::Id => "Identifier",
                    Field::Name => "Project name",
                    Field::Description => "Description",
                    Field::Deadline => "Deadline",
                    Field::ProjectId => "Project",
                    Field::Title => "Reminder header",
                    Field::Text => "Reminder text",
                    Field::DueDate => "Due date",
                };
                write!(f, "{label} {message}.")
            }
            Error::NotFound { entity } => write!(f, "That {entity} no longer exists."),
            Error::Changed { message } => write!(f, "{message}"),
            Error::SchemaTooNew { found, supported } => write!(
                f,
                "This data was saved by a newer version of Swish (schema {found}; this version supports {supported}). Update Swish to open it."
            ),
            Error::ForeignDatabase => write!(
                f,
                "The Swish data file belongs to another application and was not opened."
            ),
            Error::Storage(_) | Error::Io(_) => write!(
                f,
                "Swish could not reach its local data file. Nothing was changed."
            ),
        }
    }
}

impl std::error::Error for Error {}

impl From<rusqlite::Error> for Error {
    fn from(error: rusqlite::Error) -> Self {
        Error::Storage(error)
    }
}

impl From<std::io::Error> for Error {
    fn from(error: std::io::Error) -> Self {
        Error::Io(error)
    }
}

/// Serializable form for the frontend: `{ code, field?, message }`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiError {
    pub code: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub field: Option<Field>,
    pub message: String,
}

impl From<Error> for ApiError {
    fn from(error: Error) -> Self {
        ApiError {
            code: error.code(),
            field: error.field(),
            message: error.to_string(),
        }
    }
}
