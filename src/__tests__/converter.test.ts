import { describe, expect, it } from "vitest";
import { attrName, convertFragment, convertPage, styleToObject } from "../../scripts/html-to-tsx.mjs";

describe("styleToObject", () => {
  it("turns inline styles into a React style object literal", () => {
    expect(styleToObject("display: flex; gap: 12px; font-family: 'Outfit', sans-serif; --x: 1")).toBe(
      `{ display: "flex", gap: "12px", fontFamily: "'Outfit', sans-serif", "--x": "1" }`,
    );
  });
  it("keeps semicolons and colons inside parentheses and quotes", () => {
    expect(styleToObject(`background: url("data:image/svg+xml;utf8,<svg/>"); color: red`)).toBe(
      `{ background: "url(\\"data:image/svg+xml;utf8,<svg/>\\")", color: "red" }`,
    );
  });
  it("prefixes vendor properties the React way", () => {
    expect(styleToObject("-webkit-background-clip: text; background-clip: text")).toBe(`{ WebkitBackgroundClip: "text", backgroundClip: "text" }`);
  });
  it("returns an empty object for empty styles", () => {
    expect(styleToObject("  ")).toBe("{}");
  });
});

describe("attrName", () => {
  it("renames attributes for React", () => {
    expect(attrName("class")).toBe("className");
    expect(attrName("stroke-width")).toBe("strokeWidth");
    expect(attrName("for")).toBe("htmlFor");
    expect(attrName("tabindex")).toBe("tabIndex");
    expect(attrName("aria-label")).toBe("aria-label");
    expect(attrName("data-x")).toBe("data-x");
  });
});

describe("convertFragment", () => {
  it("rewrites screen and external links to <Link>", () => {
    expect(convertFragment(`<a href="5-1-stories.html" class="e-nav">Stories</a>`)).toBe(`<Link to="5-1-stories" className="e-nav">Stories</Link>`);
    expect(convertFragment(`<a href="6-3-x.html#edits">x</a>`)).toBe(`<Link to="6-3-x">x</Link>`);
    expect(convertFragment(`<a href="https://x.test/" title="t">x</a>`)).toBe(`<Link to="https://x.test/" title="t">x</Link>`);
    expect(convertFragment(`<a href="mailto:a@b.test">mail</a>`)).toBe(`<Link to="mailto:a@b.test">mail</Link>`);
    expect(convertFragment(`<a href="#">x</a>`)).toBe(`<a href="#">x</a>`);
  });

  it("self-closes void and empty elements", () => {
    expect(convertFragment(`<input class="e-input" value="a">`)).toBe(`<input className="e-input" defaultValue="a" />`);
    expect(convertFragment(`<span class="e-dot"></span>`)).toBe(`<span className="e-dot" />`);
    expect(convertFragment(`<br>`)).toBe(`<br />`);
  });

  it("escapes braces and angle brackets in text", () => {
    expect(convertFragment(`<p>use {braces}</p>`)).toBe(`<p>{"use {braces}"}</p>`);
    expect(convertFragment(`<p>1 &lt; 2</p>`)).toBe(`<p>{"1 < 2"}</p>`);
  });

  it("decodes entities and keeps apostrophes and quotes", () => {
    expect(convertFragment(`<p>You&#39;ve said &quot;four&quot;</p>`)).toBe(`<p>You've said "four"</p>`);
  });

  it("maps form controls to uncontrolled React props", () => {
    expect(convertFragment(`<input type="checkbox" class="e-check" checked>`)).toBe(`<input type="checkbox" className="e-check" defaultChecked />`);
    expect(convertFragment(`<textarea class="e-input">hello there</textarea>`)).toBe(`<textarea className="e-input" defaultValue={"hello there"} />`);
    expect(convertFragment(`<select><option value="a">A</option><option value="b" selected>B</option></select>`)).toBe(
      `<select defaultValue="b">\n  <option value="a">A</option>\n  <option value="b">B</option>\n</select>`,
    );
  });

  it("keeps empty values and writes numeric props as numbers", () => {
    expect(convertFragment(`<input class="e-input" value="">`)).toBe(`<input className="e-input" defaultValue="" />`);
    expect(convertFragment(`<textarea rows="4" maxlength="200"></textarea>`)).toBe(`<textarea rows={4} maxLength={200} defaultValue={""} />`);
    expect(convertFragment(`<input disabled type="text">`)).toBe(`<input disabled type="text" />`);
  });

  it("keeps a space between inline elements and drops layout whitespace", () => {
    expect(convertFragment(`<p>Practice <strong>now</strong> please</p>`)).toBe(`<p>\n  Practice <strong>now</strong> please\n</p>`);
    expect(convertFragment(`<div style="display: flex"> <span>a</span> <span>b</span> </div>`)).toBe(`<div style={{ display: "flex" }}>\n  <span>a</span>\n  <span>b</span>\n</div>`);
  });

  it("converts SVG attributes", () => {
    expect(convertFragment(`<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><path d="M1 1"/></svg>`)).toBe(
      `<svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round">\n  <path d="M1 1" />\n</svg>`,
    );
  });

  it("drops comments, scripts, styles and links", () => {
    expect(convertFragment(`<!-- hi --><link rel="stylesheet" href="x.css"><script>1</script><style>a{}</style><p>x</p>`)).toBe(`<p>x</p>`);
  });

  it("replaces the wordmark with the component", () => {
    const wm = `<span style="font-family: 'Outfit', sans-serif; font-weight: 700; font-size: 26px; line-height: 1"><svg viewBox="5 0 54 61"><path d="M1 1"/></svg><span style="color: transparent">nsayo</span></span>`;
    expect(convertFragment(wm)).toBe(`<Wordmark size={26} />`);
  });
});

describe("convertPage", () => {
  const sidebar = `<nav class="e-side" aria-label="Main"><a href="2-1-home.html" class="e-nav e-nav-on">Home</a></nav>`;

  it("wraps app pages in AppShell and drops the sidebar", () => {
    const html = `<body><div class="e-app" style="min-height: 900px;">${sidebar}<main class="e-main"><h1 class="e-h1">Hi</h1></main></div></body>`;
    const out = convertPage(html, { id: "2-1-home", name: "Home", shell: "app", nav: "home" });
    expect(out).toContain(`<AppShell nav="home">`);
    expect(out).toContain(`<h1 className="e-h1">Hi</h1>`);
    expect(out).not.toContain("e-side");
    expect(out).not.toContain("min-height");
    expect(out).toContain(`export default function Home()`);
    expect(out).toContain(`import AppShell from "../../ui/AppShell";`);
    expect(out).not.toContain(`import Link`);
  });

  it("wraps focus pages in FocusShell and imports only what it uses", () => {
    const html = `<body><div class="e-focus" style="display: flex; flex-direction: column; min-height: 900px;"><a href="2-1-home.html">Home</a></div></body>`;
    const out = convertPage(html, { id: "1-1-welcome", name: "Welcome", shell: "focus" });
    expect(out).toContain(`<FocusShell>`);
    expect(out).toContain(`import FocusShell from "../../ui/FocusShell";`);
    expect(out).toContain(`import Link from "../../ui/Link";`);
    expect(out).not.toContain("Wordmark");
    expect(out).not.toContain("min-height");
  });

  it("keeps other inline styles of the main area", () => {
    const html = `<body><div class="e-app">${sidebar}<main class="e-main" style="gap: 40px"><p>x</p></main></div></body>`;
    expect(convertPage(html, { id: "x", name: "X", shell: "app", nav: "home" })).toContain(`mainStyle={{ gap: "40px" }}`);
  });
});
