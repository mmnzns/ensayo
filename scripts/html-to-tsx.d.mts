export function styleToObject(style: string): string;
export function attrName(name: string): string;
export function convertFragment(html: string, ctx?: Record<string, unknown>): string;
export function convertPage(html: string, entry: { id: string; name: string; shell: "app" | "focus"; nav?: string }): string;
