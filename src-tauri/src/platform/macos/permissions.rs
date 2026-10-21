//! Microphone permission (AVFoundation) and the link to the right System Settings pane.

use block2::RcBlock;
use objc2::runtime::Bool;
use objc2_av_foundation::{AVAuthorizationStatus, AVCaptureDevice, AVMediaTypeAudio};
use std::sync::mpsc::channel;
use std::time::Duration;

pub fn mic_status() -> &'static str {
    let Some(media) = (unsafe { AVMediaTypeAudio }) else { return "unknown" };
    match unsafe { AVCaptureDevice::authorizationStatusForMediaType(media) } {
        AVAuthorizationStatus::Authorized => "granted",
        AVAuthorizationStatus::Denied => "denied",
        AVAuthorizationStatus::Restricted => "restricted",
        AVAuthorizationStatus::NotDetermined => "undetermined",
        _ => "unknown",
    }
}

/// Shows the macOS prompt if it hasn't been answered yet. Returns true if allowed.
pub fn request_mic() -> bool {
    let Some(media) = (unsafe { AVMediaTypeAudio }) else { return false };
    let (tx, rx) = channel();
    let block = RcBlock::new(move |granted: Bool| {
        let _ = tx.send(granted.as_bool());
    });
    unsafe { AVCaptureDevice::requestAccessForMediaType_completionHandler(media, &block) };
    rx.recv_timeout(Duration::from_secs(120)).unwrap_or(false)
}

pub const MIC_SETTINGS_URL: &str = "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone";

pub fn open_mic_settings() -> Result<(), String> {
    std::process::Command::new("open").arg(MIC_SETTINGS_URL).status().map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_is_one_of_the_known_values() {
        assert!(["granted", "denied", "restricted", "undetermined", "unknown"].contains(&mic_status()));
    }

    #[test]
    fn the_settings_link_points_at_the_microphone_pane() {
        assert!(MIC_SETTINGS_URL.contains("Privacy_Microphone"));
    }
}
