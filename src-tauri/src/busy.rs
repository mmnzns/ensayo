//! A count of work an update install must not cut off: saving an answer, a backup or restore, moving the data folder,
//! deleting everything. Each holds a `Busy` guard while it runs; `updates_install` refuses while any is held.

use std::sync::atomic::{AtomicUsize, Ordering};

/// How many pieces of work are running.
pub struct Counter(AtomicUsize);

impl Counter {
    pub const fn new() -> Counter {
        Counter(AtomicUsize::new(0))
    }

    /// Starts counting one piece of work until the guard is dropped (also when the work returns early or panics).
    pub fn hold(&self) -> Busy<'_> {
        self.0.fetch_add(1, Ordering::SeqCst);
        Busy(self)
    }

    pub fn count(&self) -> usize {
        self.0.load(Ordering::SeqCst)
    }
}

impl Default for Counter {
    fn default() -> Self {
        Counter::new()
    }
}

#[must_use = "the work is only counted while the guard is held"]
pub struct Busy<'a>(&'a Counter);

impl Drop for Busy<'_> {
    fn drop(&mut self) {
        self.0 .0.fetch_sub(1, Ordering::SeqCst);
    }
}

static GLOBAL: Counter = Counter::new();

/// Holds the app-wide counter. Bind it (`let _busy = busy::hold();`): `let _ = ...` would drop it at once.
pub fn hold() -> Busy<'static> {
    GLOBAL.hold()
}

pub fn count() -> usize {
    GLOBAL.count()
}

/// The line when an install is asked for while something is being saved.
pub const INSTALL_REFUSED: &str = "Ensayo is saving your answer. Install in a moment.";

/// `Some(line)` when an update must not install now, given how many pieces of work are running.
pub fn install_refusal(running: usize) -> Option<&'static str> {
    (running > 0).then_some(INSTALL_REFUSED)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_count_rises_with_each_guard_and_falls_when_each_drops() {
        let c = Counter::new();
        assert_eq!(c.count(), 0);
        let a = c.hold();
        let b = c.hold();
        assert_eq!(c.count(), 2);
        drop(a);
        assert_eq!(c.count(), 1);
        drop(b);
        assert_eq!(c.count(), 0);
    }

    #[test]
    fn a_guard_lets_go_when_the_work_returns_early_or_panics() {
        let c = Counter::new();
        let early = |fail: bool| -> Result<(), ()> {
            let _busy = c.hold();
            if fail {
                return Err(());
            }
            Ok(())
        };
        assert!(early(true).is_err() && early(false).is_ok());
        assert_eq!(c.count(), 0);
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _busy = c.hold();
            panic!("work failed");
        }));
        assert_eq!(c.count(), 0);
    }

    #[test]
    fn an_install_is_refused_only_while_something_is_running_and_the_line_is_plain() {
        let c = Counter::new();
        assert_eq!(install_refusal(c.count()), None);
        let _busy = c.hold();
        assert_eq!(install_refusal(c.count()), Some("Ensayo is saving your answer. Install in a moment."));
        assert!(!INSTALL_REFUSED.contains('\u{2014}'));
    }

    #[test]
    fn the_app_wide_counter_is_one_per_process() {
        let before = count();
        let guard = hold();
        assert!(count() > before);
        drop(guard);
    }
}
