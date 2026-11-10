/**
 * Docs loader (SERVER ONLY). The documentation is plain markdown in /docs, the single source of truth: it is read at
 * build time, rendered to HTML, and shown inside the app at /docs. Editing a .md file edits the page.
 *
 * The HTML is produced from our own repository files at build time (never from user input), so it is safe to inject.
 */
import fs from "node:fs";
import path from "node:path";
import { marked } from "marked";

export interface DocMeta {
  slug: string;
  file: string;
  title: string;
  blurb: string;
}

/** Order = sidebar order. `how-it-works` is also served at the bare /docs URL. */
export const DOCS: DocMeta[] = [
  { slug: "how-it-works", file: "HOW_IT_WORKS.md", title: "How it works", blurb: "The product, every page, what happens on chain and how the code behaves." },
  { slug: "integrations", file: "INTEGRATIONS.md", title: "Integrations", blurb: "What is verified, the trust assumptions and what you must provide." },
  { slug: "brand", file: "BRAND.md", title: "Design system", blurb: "Colors, type, logo, voice and components." },
  { slug: "reference", file: "REFERENCE.md", title: "Reference inspection", blurb: "What was inspected on tryauction.fun." },
  { slug: "qa", file: "QA.md", title: "QA report", blurb: "Tests, comparison results and known limits." },
];

export interface TocItem {
  id: string;
  text: string;
  level: 2 | 3;
}
export interface Doc extends DocMeta {
  /** First `# heading` of the file (rendered separately as the page title). */
  heading: string;
  html: string;
  toc: TocItem[];
}

const cache = new Map<string, Doc>();

const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const stripTags = (s: string) => s.replace(/<[^>]+>/g, "");

/** GitHub-style slug, so the `#1-the-idea-in-one-minute` links inside the markdown resolve. */
const slugify = (s: string) =>
  decode(stripTags(s))
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-");

const SLUG_BY_FILE = new Map(DOCS.map((d) => [d.file.toLowerCase(), d.slug]));
const docHref = (slug: string) => (slug === "how-it-works" ? "/docs" : `/docs/${slug}`);
export const hrefFor = docHref;

function postProcess(raw: string): { html: string; toc: TocItem[]; heading: string } {
  let heading = "";
  const toc: TocItem[] = [];
  const used = new Map<string, number>();

  // The file's H1 becomes the page title, rendered by the page component.
  let html = raw.replace(/<h1>([\s\S]*?)<\/h1>/, (_m, inner: string) => {
    heading = decode(stripTags(inner));
    return "";
  });

  // A hand-written "Contents" list is useful on GitHub but duplicates the sidebar's "On this page" here.
  html = html.replace(/<p><strong>Contents<\/strong><\/p>\s*<ol>[\s\S]*?<\/ol>\s*/, "");

  // headings: ids + a self-link, and collect the table of contents
  html = html.replace(/<h([2-4])>([\s\S]*?)<\/h\1>/g, (_m, lvl: string, inner: string) => {
    let id = slugify(inner) || "section";
    const n = used.get(id) ?? 0;
    used.set(id, n + 1);
    if (n) id = `${id}-${n}`;
    if (lvl === "2" || lvl === "3") toc.push({ id, text: decode(stripTags(inner)), level: Number(lvl) as 2 | 3 });
    return `<h${lvl} id="${id}">${inner}<a class="anchor" href="#${id}" aria-label="Link to this section">#</a></h${lvl}>`;
  });

  // links: sibling docs → in-app pages; repo-source links → plain code (they don't exist on the site); externals → new tab
  html = html.replace(/<a href="([^"]*)"([^>]*)>([\s\S]*?)<\/a>/g, (m, href: string, rest: string, inner: string) => {
    if (href.startsWith("#") || href.includes('class="anchor"')) return m;
    if (/^https?:\/\//.test(href)) return `<a href="${href}"${rest} target="_blank" rel="noopener noreferrer">${inner}</a>`;
    const [file, hash = ""] = href.split("#");
    const sibling = SLUG_BY_FILE.get(file.replace(/^\.\//, "").replace(/^docs\//, "").toLowerCase());
    if (sibling) {
      // "[INTEGRATIONS.md](INTEGRATIONS.md)" reads fine on GitHub; on the site show the document's title instead
      const label = /^[A-Z_]+\.md$/i.test(stripTags(inner).trim()) ? DOCS.find((d) => d.slug === sibling)!.title : inner;
      return `<a href="${docHref(sibling)}${hash ? "#" + hash : ""}"${rest}>${label}</a>`;
    }
    // anything else relative (../src/…, ../scripts/…, ../public/…) points into the repo: show it as code, not a dead link
    return inner.includes("<code") ? inner : `<code>${inner}</code>`;
  });

  // Tables scroll inside their own keyboard-focusable region (never widens the page). Each region needs a UNIQUE
  // accessible name, so it is "Table N: <the section it sits in>".
  let current = "document";
  let n = 0;
  html = html.replace(/<h[2-4] id="[^"]+">([\s\S]*?)<a class="anchor"|<table>/g, (m, inner?: string) => {
    if (inner !== undefined) {
      current = decode(stripTags(inner)).trim();
      return m;
    }
    n += 1;
    const label = `Table ${n}: ${current}`.replace(/"/g, "&quot;");
    return `<div class="tbl-wrap" role="region" aria-label="${label}" tabindex="0"><table class="tbl">`;
  });
  html = html.replace(/<\/table>/g, "</table></div>").replace(/<pre>/g, '<pre tabindex="0">');

  return { html, toc, heading };
}

export function getDoc(slug: string): Doc | null {
  const meta = DOCS.find((d) => d.slug === slug);
  if (!meta) return null;
  const hit = cache.get(slug);
  if (hit && process.env.NODE_ENV === "production") return hit;
  const source = fs.readFileSync(path.join(process.cwd(), "docs", meta.file), "utf8");
  const raw = marked.parse(source, { gfm: true, async: false }) as string;
  const { html, toc, heading } = postProcess(raw);
  const doc: Doc = { ...meta, heading: heading || meta.title, html, toc };
  cache.set(slug, doc);
  return doc;
}
