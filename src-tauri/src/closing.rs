//! Closing with the shared close sound, following Terminal 2.0. The window's close and
//! the app's exit are held, the page is asked to finish (it waits for queued saves and
//! starts the sound), then `finish_exit` hides the window and exits when the sound ends.
//! Closing never waits on the sound: the window disappears at once.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager};

/// Upper bound on keeping a hidden app alive for its close sound (Core's MAX_CLOSE_MS).
pub const MAX_CLOSE_SOUND_MS: u64 = 6500;
pub const CLOSE_EVENT: &str = "swish-close-requested";

/// Set once the page has finished, so the next exit request is let through.
#[derive(Default)]
pub struct ExitAllowed(pub AtomicBool);

#[derive(Debug, PartialEq, Eq)]
pub struct ExitPlan {
    pub leave_fullscreen: bool,
    pub linger_ms: u64,
}

pub fn exit_plan(requested: Option<u64>, fullscreen: bool) -> ExitPlan {
    let linger_ms = requested.unwrap_or(0).min(MAX_CLOSE_SOUND_MS);
    ExitPlan {
        leave_fullscreen: fullscreen && linger_ms > 0,
        linger_ms,
    }
}

/// Asks the page to finish instead of closing immediately.
pub fn request_close(app: &AppHandle) {
    let _ = app.emit_to("main", CLOSE_EVENT, ());
}

#[tauri::command]
pub fn finish_exit(app: AppHandle, linger_ms: Option<u64>) {
    #[cfg(debug_assertions)]
    eprintln!("swish: finish_exit linger_ms={linger_ms:?}");
    app.state::<ExitAllowed>().0.store(true, Ordering::SeqCst);
    // Synchronous commands run on the macOS main thread; blocking there would stall the
    // run loop that animates a fullscreen Space shut, so the tail runs on a worker.
    std::thread::spawn(move || finish(app, linger_ms));
}

fn finish(app: AppHandle, linger_ms: Option<u64>) {
    let windows: Vec<_> = app.webview_windows().into_values().collect();
    let fullscreen = windows.iter().any(|w| w.is_fullscreen().unwrap_or(false));
    let plan = exit_plan(linger_ms, fullscreen);
    if plan.linger_ms == 0 {
        app.exit(0);
        return;
    }
    let started = Instant::now();
    if plan.leave_fullscreen {
        // Hiding a fullscreen macOS window would leave its empty Space on screen for the tail.
        for window in &windows {
            let _ = window.set_fullscreen(false);
        }
        let deadline = Instant::now() + Duration::from_millis(2000);
        while Instant::now() < deadline
            && windows.iter().any(|w| w.is_fullscreen().unwrap_or(false))
        {
            std::thread::sleep(Duration::from_millis(25));
        }
        std::thread::sleep(Duration::from_millis(700));
    }
    for window in &windows {
        let _ = window.hide();
    }
    let elapsed = u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX);
    std::thread::sleep(Duration::from_millis(
        plan.linger_ms.saturating_sub(elapsed),
    ));
    app.exit(0);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plans_cap_the_tail_and_only_leave_fullscreen_when_lingering() {
        assert_eq!(
            exit_plan(None, false),
            ExitPlan {
                leave_fullscreen: false,
                linger_ms: 0
            }
        );
        assert_eq!(
            exit_plan(Some(2500), false),
            ExitPlan {
                leave_fullscreen: false,
                linger_ms: 2500
            }
        );
        assert_eq!(
            exit_plan(Some(60_000), true),
            ExitPlan {
                leave_fullscreen: true,
                linger_ms: MAX_CLOSE_SOUND_MS
            }
        );
        assert_eq!(
            exit_plan(Some(0), true),
            ExitPlan {
                leave_fullscreen: false,
                linger_ms: 0
            }
        );
    }
}
