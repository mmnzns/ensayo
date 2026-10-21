//! Microphone access (the three Privacy & security switches) and the link to the right Settings page.
//! Windows never prompts a desktop app, so "request" only reports what the switches say.

use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
use winreg::RegKey;

const STORE: &str = r"Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone";

fn value(root: RegKey, path: &str) -> Option<String> {
    root.open_subkey(path).ok()?.get_value::<String, _>("Value").ok()
}

/// Device-wide, all apps, desktop apps. A missing key means Windows' default: allowed.
pub fn status_from(device: Option<&str>, apps: Option<&str>, desktop: Option<&str>) -> &'static str {
    if [device, apps, desktop].iter().any(|v| v.is_some_and(|v| v.eq_ignore_ascii_case("Deny"))) {
        "denied"
    } else {
        "granted"
    }
}

pub fn mic_status() -> &'static str {
    let device = value(RegKey::predef(HKEY_LOCAL_MACHINE), STORE);
    let apps = value(RegKey::predef(HKEY_CURRENT_USER), STORE);
    let desktop = value(RegKey::predef(HKEY_CURRENT_USER), &format!(r"{STORE}\NonPackaged"));
    status_from(device.as_deref(), apps.as_deref(), desktop.as_deref())
}

pub fn request_mic() -> bool {
    mic_status() == "granted"
}

pub const MIC_SETTINGS_URL: &str = "ms-settings:privacy-microphone";

pub fn open_mic_settings() -> Result<(), String> {
    std::process::Command::new("explorer").arg(MIC_SETTINGS_URL).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn any_switch_off_means_denied() {
        assert_eq!(status_from(Some("Allow"), Some("Allow"), Some("Allow")), "granted");
        assert_eq!(status_from(Some("Deny"), Some("Allow"), Some("Allow")), "denied");
        assert_eq!(status_from(Some("Allow"), Some("Deny"), Some("Allow")), "denied");
        assert_eq!(status_from(Some("Allow"), Some("Allow"), Some("Deny")), "denied");
    }

    #[test]
    fn missing_keys_are_the_windows_default_allow() {
        assert_eq!(status_from(None, None, None), "granted");
    }

    #[test]
    fn the_settings_link_points_at_the_microphone_page() {
        assert_eq!(MIC_SETTINGS_URL, "ms-settings:privacy-microphone");
    }
}
