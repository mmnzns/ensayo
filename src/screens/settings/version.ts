/** The build's version (package.json); the constant is missing under test. */
export function appVersion(): string {
  return typeof __APP_VERSION__ === "undefined" ? "0.1.0" : __APP_VERSION__;
}
