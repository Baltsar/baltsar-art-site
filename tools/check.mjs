#!/usr/bin/env node
// Pre-flight for a hand-written static site. No dependencies, no build.
//   node tools/check.mjs
// Exits non-zero if anything would embarrass us in public.

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..");
const SITE = "https://www.baltsar.art";
// The @baltsar.art mailbox does not exist yet, so every mailto has to go here.
const CONTACT = "gustaf.garnow@gmail.com";

const problems = [];
const notices = [];
const fail = (file, message) => problems.push({ file, message });
// Worth seeing, not worth blocking a deploy over.
const note = (file, message) => notices.push({ file, message });

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".") || name === "node_modules" || name === "tools") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
};

const files = walk(ROOT);
const pages = files.filter((f) => f.endsWith(".html"));
const rel = (f) => relative(ROOT, f);

// Attributes that point at something that has to exist. `content` is excluded
// on purpose — meta content is prose, except for the image tags handled below.
const ASSET_ATTRS = /\b(?:src|href|poster|data-src|data-src-lg|data-src-pt|data-poster-lg|data-poster-pt)\s*=\s*"([^"]+)"/g;
const SRCSET = /\bsrcset\s*=\s*"([^"]+)"/g;
const META_IMAGE = /<meta\b[^>]*\b(?:property|name)="(?:og:image(?::secure_url)?|twitter:image)"[^>]*\bcontent="([^"]+)"/g;

const referenced = new Set();
const idsByPage = new Map();

for (const page of pages) {
  const html = readFileSync(page, "utf8");
  const here = dirname(page);

  // every id on the page, and any duplicates among them
  const ids = new Set();
  for (const [, id] of html.matchAll(/\bid\s*=\s*"([^"]+)"/g)) {
    if (ids.has(id)) fail(rel(page), `duplicate id "${id}"`);
    ids.add(id);
  }
  idsByPage.set(rel(page), ids);

  const targets = [];
  for (const [, value] of html.matchAll(ASSET_ATTRS)) targets.push(value);
  for (const [, value] of html.matchAll(META_IMAGE)) targets.push(value);
  for (const [, value] of html.matchAll(SRCSET)) {
    for (const part of value.split(",")) targets.push(part.trim().split(/\s+/)[0]);
  }

  for (const raw of targets) {
    const value = raw.trim();
    if (!value || value === "#" || value.startsWith("data:") || value.startsWith("mailto:")) continue;

    // absolute URLs on our own domain must match a real file
    const local = value.startsWith(SITE) ? value.slice(SITE.length) || "/" : value;
    if (/^https?:/i.test(local)) continue;
    if (local.startsWith("#")) {
      if (!ids.has(local.slice(1))) fail(rel(page), `anchor ${local} has no matching id`);
      continue;
    }

    const [beforeHash, hash] = local.split("#");
    const path = beforeHash.split("?")[0];
    if (!path) continue;

    // cleanUrls: /linjen is served from linjen.html
    const onDisk = path.startsWith("/") ? join(ROOT, path) : join(here, path);
    const candidates =
      path === "/" || path === "./"
        ? [join(ROOT, "index.html")]
        : [onDisk, `${onDisk}.html`, join(onDisk, "index.html")];

    const target = candidates.find((candidate) => existsSync(candidate));
    if (!target) {
      fail(rel(page), `missing file: ${path}`);
      continue;
    }
    referenced.add(resolve(target));

    if (hash && target.endsWith(".html")) {
      const targetIds = new Set(
        [...readFileSync(target, "utf8").matchAll(/\bid\s*=\s*"([^"]+)"/g)].map((m) => m[1])
      );
      if (!targetIds.has(hash)) fail(rel(page), `${path}#${hash} has no matching id`);
    }
  }

  // the address bar should never show a file extension
  for (const [, value] of html.matchAll(/\bhref\s*=\s*"([^"]*\.html[^"]*)"/g)) {
    fail(rel(page), `links to ${value} — drop .html, the host serves clean URLs`);
  }
  for (const [, value] of html.matchAll(/\b(?:href|content)\s*=\s*"(https:\/\/www\.baltsar\.art[^"]*\.html[^"]*)"/g)) {
    fail(rel(page), `canonical or og url still carries .html: ${value}`);
  }

  // a mailto nobody reads is worse than no mailto at all
  for (const [, address] of html.matchAll(/\bhref\s*=\s*"mailto:([^"?]+)/g)) {
    if (address !== CONTACT) {
      fail(rel(page), `mailto goes to ${address}, which nobody reads — use ${CONTACT}`);
    }
  }

  // images need alt, even if empty for decorative ones
  for (const [tag] of html.matchAll(/<img\b[^>]*>/g)) {
    if (!/\balt\s*=/.test(tag)) fail(rel(page), `<img> without alt: ${tag.slice(0, 70)}…`);
  }

  // new tabs need rel=noopener
  for (const [tag] of html.matchAll(/<a\b[^>]*target\s*=\s*"_blank"[^>]*>/g)) {
    if (!/\brel\s*=\s*"[^"]*noopener/.test(tag)) {
      fail(rel(page), `target="_blank" without rel="noopener": ${tag.slice(0, 70)}…`);
    }
  }

  if (!/<link\b[^>]*rel="canonical"/.test(html)) fail(rel(page), "no canonical link");
  if (!/<meta\b[^>]*property="og:image"/.test(html)) fail(rel(page), "no og:image");
  if (!/<html\b[^>]*\blang=/.test(html)) fail(rel(page), "<html> without lang");
  if (!/<title>/.test(html)) fail(rel(page), "no <title>");
}

// sitemap should list the pages we actually have, and nothing else
const sitemapPath = join(ROOT, "sitemap.xml");
if (existsSync(sitemapPath)) {
  const listed = [...readFileSync(sitemapPath, "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    (m) => m[1]
  );
  for (const loc of listed) {
    if (loc.endsWith(".html")) fail("sitemap.xml", `${loc} should drop .html`);
    const path = loc.replace(SITE, "") || "/";
    const target = path === "/" ? join(ROOT, "index.html") : join(ROOT, `${path}.html`);
    if (!existsSync(target)) fail("sitemap.xml", `lists ${loc}, which does not exist`);
  }
  for (const page of pages) {
    const name = rel(page);
    const expected = name === "index.html" ? `${SITE}/` : `${SITE}/${name.slice(0, -5)}`;
    if (!listed.includes(expected)) fail("sitemap.xml", `does not list ${expected}`);
  }
}

// assets nobody points at are dead weight
const CARRIED = /\.(jpg|jpeg|png|gif|svg|ico|mp4|webm|mp3|webp)$/i;
for (const file of files) {
  if (!CARRIED.test(file)) continue;
  if (referenced.has(resolve(file))) continue;
  const name = rel(file);
  // og images and touch icons are fetched by crawlers, not linked from markup
  if (/og-|apple-touch|favicon/.test(name)) continue;
  note(name, "not referenced by any page");
}

const group = (list) => {
  const byFile = new Map();
  for (const { file, message } of list) {
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file).push(message);
  }
  for (const [file, messages] of byFile) {
    console.log(file);
    for (const m of messages) console.log("  " + m);
  }
};

if (notices.length) {
  console.log("notices");
  group(notices);
  console.log("");
}

if (problems.length === 0) {
  console.log(`clean — ${pages.length} pages checked`);
  process.exit(0);
}

group(problems);
console.log(`\n${problems.length} problem(s)`);
process.exit(1);
