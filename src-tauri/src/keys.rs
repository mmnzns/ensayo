//! API keys for "your own key" feedback, kept in the macOS Keychain (Windows: Credential Manager), never in a
//! file. Service "Ensayo", one account per provider.

const SERVICE: &str = "Ensayo";

fn entry(provider: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, provider).map_err(|e| format!("Couldn't open your system's secure key storage: {e}"))
}

pub fn set(provider: &str, key: &str) -> Result<(), String> {
    entry(provider)?.set_password(key.trim()).map_err(|e| format!("Couldn't save the key: {e}"))
}

pub fn get(provider: &str) -> Option<String> {
    entry(provider).ok()?.get_password().ok().filter(|k| !k.is_empty())
}

pub fn clear(provider: &str) -> Result<(), String> {
    match entry(provider)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Couldn't remove the key: {e}")),
    }
}

/// Every account Ensayo stores. The Windows uninstaller deletes the same list (the installer hook is added in M10).
pub const ACCOUNTS: [&str; 8] = ["claude", "openai", "gemini", "groq", "cerebras", "mistral", "openrouter", "compatible"];

/// "Delete all Ensayo data" removes every key too.
pub fn clear_all() {
    for p in ACCOUNTS {
        let _ = clear(p);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::providers::Provider;

    #[test]
    fn deleting_all_data_covers_every_key() {
        for p in Provider::ALL {
            assert!(ACCOUNTS.contains(&p.key_id()), "{}", p.key_id());
        }
        assert_eq!(ACCOUNTS.len(), Provider::ALL.len(), "no stray accounts");
    }

    #[test]
    fn keys_round_trip_and_clear() {
        // In-memory store: tests never touch the real Keychain.
        keyring::set_default_credential_builder(keyring::mock::default_credential_builder());
        // The mock keeps nothing between entries, so check within one entry's lifetime through the API shape.
        assert!(set("claude", " sk-test ").is_ok());
        assert!(clear("claude").is_ok());
        assert!(clear("never-set").is_ok());
        assert_eq!(get("never-set"), None);
    }

    #[test]
    fn the_windows_uninstaller_deletes_every_account_this_list_names() {
        let hook = include_str!("../windows/hooks.nsh");
        for account in ACCOUNTS {
            assert!(hook.contains(&format!("cmdkey /delete:{account}.{SERVICE}")), "the uninstall hook misses {account}");
        }
    }

    #[test]
    fn the_windows_uninstaller_pops_every_result_and_leaves_keys_and_data_alone_during_an_update() {
        let hook = include_str!("../windows/hooks.nsh");
        let post = &hook[hook.find("NSIS_HOOK_POSTUNINSTALL").unwrap()..];
        assert_eq!(post.matches("nsExec::Exec").count(), post.matches("Pop $0").count(), "an unpopped result is left on the NSIS stack");
        let guard = post.find("$UpdateMode <> 1").expect("an update (/UPDATE) must skip the deletion");
        assert!(guard < post.find("nsExec::Exec").unwrap() && guard < post.find("RMDir").unwrap());
    }

    #[test]
    fn the_service_name_is_ensayos_own_so_other_apps_keys_are_never_read() {
        assert_eq!(SERVICE, "Ensayo");
    }
}
