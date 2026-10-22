import { useEffect, useState } from "react";

/** The build's version (package.json); the constant is missing under test. */
export function appVersion(): string {
  return typeof __APP_VERSION__ === "undefined" ? "0.1.0" : __APP_VERSION__;
}

const inApp = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** The version to show. In the app it is read from the app itself (the version in tauri.conf.json); in the browser
 *  preview it is the build's version. */
export function useAppVersion(): string {
  const [version, setVersion] = useState(appVersion);
  useEffect(() => {
    if (!inApp()) return;
    let gone = false;
    import("@tauri-apps/api/app").then(
      ({ getVersion }) => getVersion().then((v) => !gone && setVersion(v), () => {}),
      () => {},
    );
    return () => {
      gone = true;
    };
  }, []);
  return version;
}
