//! Swish's project/reminder domain and local SQLite storage.
//!
//! This crate has no Tauri dependency so its tests run on any machine. The native host
//! (`src-tauri/src/main.rs`) owns paths, commands, and lifecycle.

pub mod date;
mod deletion;
pub mod error;
pub mod migrations;
pub mod model;
mod projects;
mod reminders;
pub mod store;

pub use deletion::DeletedProject;
pub use error::{ApiError, Error, Field};
pub use model::{Project, ProjectInput, Reminder, ReminderInput, Workspace};
pub use store::{DATABASE_FILE, Store};
