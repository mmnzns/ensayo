//! Keeps the main window on the screen. The config opens it at 1200x780, which is taller than the work area of a
//! 1366x768 laptop (the taskbar leaves about 720 px). The same check covers a remembered size or position from a
//! bigger or a disconnected monitor.

/// A rectangle in physical pixels.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub w: u32,
    pub h: u32,
}

/// The most of the work area a window may take.
const MAX_SHARE_PERCENT: u32 = 90;

/// The window rect to use: no bigger than 90% of the work area, kept where it is when that still lies wholly inside
/// the work area, otherwise centered in it.
pub fn fit_to_work_area(window: Rect, work: Rect) -> Rect {
    let w = window.w.min(work.w * MAX_SHARE_PERCENT / 100);
    let h = window.h.min(work.h * MAX_SHARE_PERCENT / 100);
    let inside = window.x >= work.x
        && window.y >= work.y
        && window.x as i64 + w as i64 <= work.x as i64 + work.w as i64
        && window.y as i64 + h as i64 <= work.y as i64 + work.h as i64;
    if inside {
        return Rect { x: window.x, y: window.y, w, h };
    }
    Rect { x: work.x + ((work.w - w) / 2) as i32, y: work.y + ((work.h - h) / 2) as i32, w, h }
}

#[cfg(test)]
mod tests {
    use super::*;

    const LAPTOP: Rect = Rect { x: 0, y: 0, w: 1366, h: 720 };

    #[test]
    fn the_default_window_shrinks_to_fit_a_1366x768_laptop_and_is_centered() {
        let r = fit_to_work_area(Rect { x: 83, y: -30, w: 1200, h: 780 }, LAPTOP);
        assert_eq!((r.w, r.h), (1200, 648));
        assert_eq!((r.x, r.y), (83, 36));
    }

    #[test]
    fn the_minimum_size_still_fits_that_laptop() {
        assert!(900 <= LAPTOP.w * 90 / 100 && 600 <= LAPTOP.h * 90 / 100);
    }

    #[test]
    fn a_window_that_fits_stays_where_it_is() {
        let w = Rect { x: 100, y: 50, w: 1000, h: 600 };
        assert_eq!(fit_to_work_area(w, LAPTOP), w);
    }

    #[test]
    fn a_remembered_position_off_the_screen_is_pulled_back() {
        let r = fit_to_work_area(Rect { x: 2500, y: 100, w: 1000, h: 600 }, LAPTOP);
        assert_eq!((r.x, r.y, r.w, r.h), (183, 60, 1000, 600));
    }

    #[test]
    fn a_work_area_that_does_not_start_at_zero_is_respected() {
        // A taskbar on the left edge: the work area starts at x = 48.
        let work = Rect { x: 48, y: 0, w: 1920, h: 1040 };
        let r = fit_to_work_area(Rect { x: 48, y: 0, w: 1200, h: 780 }, work);
        assert_eq!(r, Rect { x: 48, y: 0, w: 1200, h: 780 });
    }
}
