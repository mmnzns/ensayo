// Converts a page from the design export (Design/screens/html) into a React component draft.
// Faithful markup only: class to className, inline styles to objects, SVG attributes to camelCase, `.html` links to
// <Link>, the repeated sidebar to <AppShell>, the wordmark to <Wordmark>. Data wiring is done by hand afterwards.
// Pure functions (no file access) so they can be tested; the command line lives in html-to-tsx-cli.mjs.

import { parseFragment } from "parse5";

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const DROP = new Set(["script", "style", "link", "meta", "title", "head"]);
const INLINE = new Set(["a", "span", "strong", "em", "b", "i", "small", "code", "kbd", "svg", "sup", "sub", "abbr", "mark", "u", "time", "label", "button"]);
const RENAME = {
  class: "className",
  for: "htmlFor",
  tabindex: "tabIndex",
  readonly: "readOnly",
  maxlength: "maxLength",
  minlength: "minLength",
  autocomplete: "autoComplete",
  colspan: "colSpan",
  rowspan: "rowSpan",
  contenteditable: "contentEditable",
  spellcheck: "spellCheck",
  autofocus: "autoFocus",
  crossorigin: "crossOrigin",
  datetime: "dateTime",
  novalidate: "noValidate",
  srcset: "srcSet",
  inputmode: "inputMode",
  viewbox: "viewBox",
};

// ---------- attributes and styles ----------

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function attrName(name) {
  if (RENAME[name]) return RENAME[name];
  if (/^(aria|data)-/.test(name)) return name;
  if (name.includes(":")) return name.replace(/:([a-z])/g, (_, c) => c.toUpperCase());
  if (name.includes("-")) return name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  return name;
}

/** Splits "a: b; c: d" at semicolons that are outside quotes and parentheses. */
function splitDeclarations(style) {
  const out = [];
  let cur = "";
  let quote = "";
  let depth = 0;
  for (const ch of style) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === ";" && depth === 0) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  const decls = [];
  for (const d of out) {
    let q = "";
    let at = -1;
    for (let i = 0; i < d.length; i++) {
      const c = d[i];
      if (q) {
        if (c === q) q = "";
      } else if (c === '"' || c === "'") q = c;
      else if (c === ":") {
        at = i;
        break;
      }
    }
    if (at < 0) continue;
    const prop = d.slice(0, at).trim();
    const value = d.slice(at + 1).trim();
    if (prop && value) decls.push([prop, value]);
  }
  return decls;
}

function styleKey(prop) {
  if (prop.startsWith("--")) return JSON.stringify(prop);
  const vendor = /^-(webkit|moz|ms|o)-/.exec(prop);
  const parts = prop.replace(/^-/, "").split("-");
  const first = vendor ? (vendor[1] === "ms" ? "ms" : cap(parts[0])) : parts[0];
  return first + parts.slice(1).map(cap).join("");
}

export function styleToObject(style) {
  const decls = splitDeclarations(style);
  if (!decls.length) return "{}";
  return `{ ${decls.map(([p, v]) => `${styleKey(p)}: ${JSON.stringify(v)}`).join(", ")} }`;
}

const stripDecls = (style, drop) =>
  splitDeclarations(style)
    .filter(([p, v]) => !drop(p, v))
    .map(([p, v]) => `${p}: ${v}`)
    .join("; ");

// ---------- tree helpers ----------

const attrOf = (node, name) => node.attrs?.find((a) => a.name === name)?.value;
const hasClass = (node, cls) => (attrOf(node, "class") || "").split(/\s+/).includes(cls);
const elementChildren = (node) => (node.childNodes || []).filter((n) => n.tagName && !DROP.has(n.tagName));

function findDescendant(node, test) {
  for (const c of node.childNodes || []) {
    if (test(c)) return c;
    const f = findDescendant(c, test);
    if (f) return f;
  }
  return null;
}

function isWordmark(node) {
  if (node.tagName !== "span") return false;
  const style = attrOf(node, "style") || "";
  if (!/font-family:\s*'?"?Outfit/.test(style)) return false;
  return !!findDescendant(node, (n) => n.tagName === "svg" && (attrOf(n, "viewBox") ?? attrOf(n, "viewbox")) === "5 0 54 61");
}

const textOf = (node) => (node.childNodes || []).map((c) => (c.nodeName === "#text" ? c.value : textOf(c))).join("");

function isFlexParent(node) {
  return /display:\s*(flex|grid|inline-flex)/.test(attrOf(node, "style") || "");
}

// ---------- rendering ----------

function jsxText(text) {
  return /[{}<>&]/.test(text) ? `{${JSON.stringify(text)}}` : text;
}

const BOOLEAN = new Set(["disabled", "required", "readOnly", "hidden", "open", "multiple", "autoFocus", "defaultChecked", "checked", "selected", "noValidate"]);
const NUMERIC = new Set(["rows", "cols", "maxLength", "minLength", "size", "tabIndex", "colSpan", "rowSpan"]);

function attrString(name, value) {
  if (value === "" && BOOLEAN.has(name)) return name;
  if (NUMERIC.has(name) && /^-?\d+$/.test(value)) return `${name}={${value}}`;
  if (/["{}\n]/.test(value) || value.includes("\\")) return `${name}={${JSON.stringify(value)}}`;
  return `${name}="${value}"`;
}

function renderAttrs(node, ctx, overrides = {}) {
  const out = [];
  const tag = node.tagName;
  for (const { name, value } of node.attrs || []) {
    if (name in overrides) continue;
    if (name === "style") {
      out.push(`style={${styleToObject(value)}}`);
      continue;
    }
    if (tag === "input" && name === "value") {
      out.push(attrString("defaultValue", value));
      continue;
    }
    if (tag === "input" && name === "checked") {
      out.push("defaultChecked");
      continue;
    }
    if (tag === "option" && name === "selected") continue;
    if (tag === "a" && name === "href" && overrides.__link) continue;
    out.push(attrString(attrName(name), value));
  }
  for (const [k, v] of Object.entries(overrides)) {
    if (k === "__link") continue;
    out.push(v);
  }
  return out;
}

/** Turns children into pieces: { kind: "text" | "el", s }. Whitespace follows HTML: collapsed, layout gaps dropped. */
function renderChildren(parent, ctx) {
  const kids = (parent.childNodes || []).filter((n) => n.nodeName !== "#comment" && !(n.tagName && DROP.has(n.tagName)) && n.nodeName !== "#documentType");
  const flex = isFlexParent(parent);
  const inlineish = (n) => !!n && (n.nodeName === "#text" || INLINE.has(n.tagName));
  const pieces = [];
  kids.forEach((n, i) => {
    if (n.nodeName === "#text") {
      const prev = kids[i - 1];
      const next = kids[i + 1];
      let t = n.value.replace(/\s+/g, " ");
      if (!t.trim()) {
        if (!flex && prev && next && inlineish(prev) && inlineish(next) && INLINE.has(prev.tagName || "span") && INLINE.has(next.tagName || "span")) pieces.push({ kind: "text", s: "{\" \"}" });
        return;
      }
      if (!inlineish(prev) || i === 0) t = t.replace(/^ /, "");
      if (!inlineish(next) || i === kids.length - 1) t = t.replace(/ $/, "");
      pieces.push({ kind: "text", s: jsxText(t) });
      return;
    }
    pieces.push({ kind: "el", s: renderElement(n, ctx) });
  });
  return pieces;
}

const indent = (s, n = 2) => s.split("\n").map((l) => (l ? " ".repeat(n) + l : l)).join("\n");

function joinPieces(pieces, mixed) {
  if (!mixed) return pieces.map((p) => p.s).join("\n");
  const lines = [];
  let cur = "";
  for (const p of pieces) {
    if (p.kind === "el" && p.s.includes("\n")) {
      if (cur) lines.push(cur);
      cur = "";
      lines.push(p.s);
    } else {
      cur += p.s;
    }
  }
  if (cur) lines.push(cur);
  return lines.join("\n");
}

function renderElement(node, ctx) {
  const tag = node.tagName;
  if (isWordmark(node)) {
    ctx.used.add("Wordmark");
    const size = /font-size:\s*([\d.]+)px/.exec(attrOf(node, "style") || "");
    return `<Wordmark size={${size ? size[1] : 26}} />`;
  }

  let open = tag;
  const overrides = {};
  const href = tag === "a" ? attrOf(node, "href") : undefined;
  const screen = href !== undefined ? /^([A-Za-z0-9._-]+)\.html(#.*)?$/.exec(href) : null;
  const external = href !== undefined && /^(https?:|mailto:)/.test(href);
  const link = screen ? screen[1] : external ? href : null;
  if (link !== null) {
    open = "Link";
    ctx.used.add("Link");
    overrides.__link = true;
    overrides.to = `to="${link}"`;
  }

  // Form controls become uncontrolled React props.
  let pieces;
  if (tag === "textarea") {
    overrides.defaultValue = `defaultValue={${JSON.stringify(textOf(node))}}`;
    pieces = [];
  } else if (tag === "select") {
    const options = elementChildren(node).filter((n) => n.tagName === "option");
    const chosen = options.find((o) => attrOf(o, "selected") !== undefined);
    if (chosen) overrides.defaultValue = attrString("defaultValue", attrOf(chosen, "value") ?? textOf(chosen).trim());
    pieces = renderChildren(node, ctx);
  } else if (VOID.has(tag)) {
    pieces = [];
  } else {
    pieces = renderChildren(node, ctx);
  }

  const attrs = renderAttrs(node, ctx, overrides);
  // `to` goes first, like href did.
  if (link !== null) attrs.sort((a, b) => (a.startsWith("to=") ? -1 : b.startsWith("to=") ? 1 : 0));
  const head = [open, ...attrs].join(" ");
  if (!pieces.length) return `<${head} />`;

  const hasText = pieces.some((p) => p.kind === "text");
  const onlyText = pieces.every((p) => p.kind === "text");
  if (onlyText) return `<${head}>${pieces.map((p) => p.s).join("")}</${open}>`;
  return `<${head}>\n${indent(joinPieces(pieces, hasText))}\n</${open}>`;
}

export function convertFragment(html, ctx = {}) {
  const used = ctx.used || new Set();
  const frag = parseFragment(html);
  const pieces = renderChildren(frag, { used });
  return joinPieces(pieces, false);
}

// ---------- pages ----------

const SHELL_DEFAULT = (p, v) => (p === "display" && v === "flex") || (p === "flex-direction" && v === "column") || p === "min-height";

export function convertPage(html, entry) {
  const used = new Set();
  const frag = parseFragment(html);
  const root = findDescendant(frag, (n) => hasClass(n, entry.shell === "app" ? "e-app" : "e-focus"));
  if (!root) throw new Error(`${entry.id}: no .e-${entry.shell === "app" ? "app" : "focus"} root found`);

  let body;
  let open;
  if (entry.shell === "app") {
    used.add("AppShell");
    const kids = elementChildren(root);
    const main = kids.find((n) => hasClass(n, "e-main"));
    const nav = kids.find((n) => hasClass(n, "e-side"));
    if (!main || !nav || kids.length !== 2) throw new Error(`${entry.id}: .e-app does not contain exactly a sidebar and a main area`);
    const rootStyle = stripDecls(attrOf(root, "style") || "", (p) => p === "min-height");
    const mainStyle = attrOf(main, "style") || "";
    const props = [`nav="${entry.nav}"`];
    if (rootStyle) props.push(`style={${styleToObject(rootStyle)}}`);
    if (mainStyle) props.push(`mainStyle={${styleToObject(mainStyle)}}`);
    open = `AppShell ${props.join(" ")}`;
    body = joinPieces(renderChildren(main, { used }), false);
    var close = "AppShell";
  } else {
    used.add("FocusShell");
    const rootStyle = stripDecls(attrOf(root, "style") || "", SHELL_DEFAULT);
    open = rootStyle ? `FocusShell style={${styleToObject(rootStyle)}}` : "FocusShell";
    body = joinPieces(renderChildren(root, { used }), false);
    close = "FocusShell";
  }

  const imports = [];
  if (used.has("AppShell")) imports.push(`import AppShell from "../../ui/AppShell";`);
  if (used.has("FocusShell")) imports.push(`import FocusShell from "../../ui/FocusShell";`);
  if (used.has("Link")) imports.push(`import Link from "../../ui/Link";`);
  if (used.has("Wordmark")) imports.push(`import Wordmark from "../../ui/Wordmark";`);

  return [
    `// Draft generated from Design/screens/html/${entry.id}.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.`,
    ...imports,
    "",
    `export default function ${entry.name}() {`,
    "  return (",
    `    <${open}>`,
    indent(body, 6),
    `    </${close}>`,
    "  );",
    "}",
    "",
  ].join("\n");
}
