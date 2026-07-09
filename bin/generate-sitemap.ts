#!/usr/bin/env tsx
/**
 * Generates a sitemap of the app's routes from the Next.js App Router filesystem
 * (src/app/**\/page.tsx), the ground truth for what the app actually serves.
 *
 * For each route it statically extracts the <Title> headings so UX can inventory
 * the per-page titles (this app has no shared page-title component, each page
 * renders its own). Headings are split into:
 *   - Page heading(s): <Title order={1}> (or a plain <Title>, whose Mantine
 *     default order is 1). A page can have several when the heading is stateful.
 *   - Sub-headings: <Title order={2..6}> / size="h2..6" — section/card/modal titles.
 *
 * When a route's own folder has no page heading, the page file's direct imports
 * are scanned one level deep to find the heading in a colocated/shared component.
 *
 * Usage:
 *   pnpm run sitemap                 # writes ./sitemap.html and prints an ASCII tree
 *   pnpm run sitemap out/site.html   # custom output path
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

const CWD = process.cwd()
const APP_DIR = resolve(CWD, 'src/app')
const SRC_DIR = resolve(CWD, 'src')
const OUTPUT = resolve(CWD, process.argv[2] ?? 'sitemap.html')

type TitleHit = {
    text: string
    order: number
    dynamic: boolean
    file: string
    external: boolean // resolved from an imported component, not the route folder
}

type RouteEntry = {
    url: string
    pageFile: string
    segments: string[]
    primary: TitleHit[] // page heading(s): order 1
    secondary: TitleHit[] // sub-headings: order 2..6
}

// ---- filesystem -------------------------------------------------------------

function walk(dir: string): string[] {
    const out: string[] = []
    for (const name of readdirSync(dir)) {
        const full = join(dir, name)
        if (statSync(full).isDirectory()) out.push(...walk(full))
        else out.push(full)
    }
    return out
}

const isRouteGroup = (seg: string) => /^\(.*\)$/.test(seg)
const rel = (f: string) => relative(CWD, f)

function fileToUrl(pageFile: string): { url: string; segments: string[] } {
    const relDir = relative(APP_DIR, dirname(pageFile))
    const segments = relDir === '' ? [] : relDir.split('/').filter((s) => !isRouteGroup(s))
    return { url: '/' + segments.join('/'), segments }
}

// ---- title extraction -------------------------------------------------------

const TITLE_RE = /<Title\b([^>]*)>([\s\S]*?)<\/Title>/g
const IMPORT_RE = /import\s+[^'"]*?\s+from\s+['"]([^'"]+)['"]/g

function parseOrder(props: string): number {
    const order = props.match(/order=\{?\s*([1-6])\s*\}?/)
    if (order) return Number(order[1])
    const size = props.match(/size=["']?h([1-6])["']?/)
    if (size) return Number(size[1])
    return 1 // Mantine <Title> defaults to order 1 (h1)
}

/** Strip child JSX tags (<br/>, <RequiredIndicator .../>) so the text is readable. */
function cleanText(raw: string): { text: string; dynamic: boolean } {
    const text = raw
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    return { text, dynamic: text.includes('{') }
}

function extractTitles(file: string, external: boolean): TitleHit[] {
    if (!existsSync(file)) return []
    const src = readFileSync(file, 'utf8')
    const hits: TitleHit[] = []
    for (const m of src.matchAll(TITLE_RE)) {
        const { text, dynamic } = cleanText(m[2])
        if (!text) continue
        hits.push({ text, order: parseOrder(m[1]), dynamic, file: rel(file), external })
    }
    return hits
}

function dedupe(hits: TitleHit[]): TitleHit[] {
    const seen = new Set<string>()
    return hits.filter((h) => {
        const key = `${h.text}::${h.order}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
    })
}

/** Resolve one import specifier to an on-disk .tsx file under src/, if any. */
function resolveSpec(spec: string, fromFile: string): string | null {
    let base: string | null = null
    if (spec.startsWith('@/')) base = join(SRC_DIR, spec.slice(2))
    else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec)
    if (!base || !base.startsWith(SRC_DIR)) return null
    for (const cand of [base + '.tsx', base, join(base, 'index.tsx')]) {
        if (cand.endsWith('.tsx') && existsSync(cand) && statSync(cand).isFile()) return cand
    }
    return null
}

/**
 * Collect the .tsx files a page pulls in, following imports up to `depth` levels
 * (page → component → child component). Used to find a heading that a page
 * renders through a shared/colocated component rather than inline.
 */
function resolveImports(pageFile: string, depth = 2): string[] {
    const found = new Set<string>()
    const visit = (file: string, remaining: number) => {
        if (remaining <= 0 || found.size > 80) return
        for (const m of readFileSync(file, 'utf8').matchAll(IMPORT_RE)) {
            const cand = resolveSpec(m[1], file)
            if (!cand || found.has(cand)) continue
            found.add(cand)
            visit(cand, remaining - 1)
        }
    }
    visit(pageFile, depth)
    return [...found]
}

/** The page heading is the lowest-order Title(s) rendered; higher orders are sub-headings. */
function pickHeadings(hits: TitleHit[]): { primary: TitleHit[]; secondary: TitleHit[] } {
    if (!hits.length) return { primary: [], secondary: [] }
    const minOrder = Math.min(...hits.map((h) => h.order))
    return { primary: hits.filter((h) => h.order === minOrder), secondary: hits.filter((h) => h.order > minOrder) }
}

// ---- route model ------------------------------------------------------------

function buildRoutes(): RouteEntry[] {
    const allFiles = walk(APP_DIR).filter((f) => /\.tsx$/.test(f))
    const pageFiles = allFiles.filter((f) => /(^|\/)page\.tsx$/.test(f))
    const routeDirs = pageFiles.map(dirname).sort((a, b) => b.length - a.length)

    // Assign each .tsx file to the deepest route dir that contains it, so a route
    // only owns components colocated with it (not a child route's).
    const ownFiles = new Map<string, string[]>(routeDirs.map((d) => [d, []]))
    for (const f of allFiles) {
        const owner = routeDirs.find((d) => f === join(d, 'page.tsx') || f.startsWith(d + '/'))
        if (owner) ownFiles.get(owner)!.push(f)
    }

    const routes = pageFiles.map((pageFile): RouteEntry => {
        const dir = dirname(pageFile)
        const { url, segments } = fileToUrl(pageFile)
        const folderHits = dedupe((ownFiles.get(dir) ?? []).flatMap((f) => extractTitles(f, false)))

        // Prefer headings from the route's own folder; only when it renders no Title
        // at all do we follow its imports to find the heading in a shared component.
        let { primary, secondary } = pickHeadings(folderHits)
        if (!primary.length) {
            const imported = dedupe(resolveImports(pageFile).flatMap((f) => extractTitles(f, true)))
            ;({ primary, secondary } = pickHeadings(imported))
        }

        return { url, pageFile: rel(pageFile), segments, primary, secondary }
    })

    return routes.sort((a, b) => a.url.localeCompare(b.url))
}

// ---- ASCII tree -------------------------------------------------------------

type TreeNode = { seg: string; children: Map<string, TreeNode>; route?: RouteEntry }

function buildTree(routes: RouteEntry[]): TreeNode {
    const root: TreeNode = { seg: '/', children: new Map() }
    for (const r of routes) {
        let node = root
        for (const seg of r.segments) {
            if (!node.children.has(seg)) node.children.set(seg, { seg, children: new Map() })
            node = node.children.get(seg)!
        }
        node.route = r
    }
    return root
}

function asciiTitle(r: RouteEntry): string {
    if (!r.primary.length) return '   (no <Title> found)'
    const names = r.primary.map((t) => t.text).join(' / ')
    const order = r.primary[0].order
    const lvl = order > 1 ? ` (h${order})` : ''
    const ext = r.primary.some((t) => t.external) ? ' [from import]' : ''
    const subs = r.secondary.length ? ` [+${r.secondary.length} sub]` : ''
    return `   « ${names} »${lvl}${ext}${subs}`
}

function renderAscii(node: TreeNode, prefix = '', isLast = true, isRoot = true): string {
    const lines: string[] = []
    if (isRoot) {
        lines.push('/')
    } else {
        const branch = isLast ? '└─ ' : '├─ '
        lines.push(`${prefix}${branch}${node.seg}${node.route ? asciiTitle(node.route) : ''}`)
    }
    const kids = [...node.children.values()]
    kids.forEach((child, i) => {
        const last = i === kids.length - 1
        const childPrefix = isRoot ? '' : prefix + (isLast ? '   ' : '│  ')
        lines.push(renderAscii(child, childPrefix, last, false))
    })
    return lines.join('\n')
}

// ---- HTML -------------------------------------------------------------------

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

function chip(t: TitleHit, kind: 'primary' | 'sub'): string {
    const cls = ['chip', kind, t.dynamic ? 'dyn' : '', t.external ? 'ext' : ''].filter(Boolean).join(' ')
    // Badge sub-headings always, and primary headings that are not an h1 (page has no h1).
    const badge = kind === 'sub' || t.order > 1 ? `<span class="hbadge">h${t.order}</span>` : ''
    const ext = t.external ? `<span class="hbadge ext" title="from imported component">↗</span>` : ''
    return `<span class="${cls}" title="${esc(t.file)}">${esc(t.text)}${badge}${ext}</span>`
}

function nodeTitleHtml(r: RouteEntry): string {
    const primary = r.primary.length
        ? `<span class="primaries">${r.primary.map((t) => chip(t, 'primary')).join('')}</span>`
        : `<span class="notitle">no &lt;Title&gt; found</span>`
    const subs = r.secondary.length
        ? `<details class="subs"><summary>+${r.secondary.length} sub-heading${r.secondary.length > 1 ? 's' : ''}</summary>` +
          `<span class="sublist">${r.secondary.map((t) => chip(t, 'sub')).join('')}</span></details>`
        : ''
    return primary + subs
}

function renderTreeHtml(node: TreeNode, isRoot = true): string {
    const kids = [...node.children.values()]
    if (isRoot) return `<ul class="tree">${kids.map((k) => renderTreeHtml(k, false)).join('')}</ul>`
    const dynamic = /^\[.*\]$/.test(node.seg)
    const seg = `<span class="seg${dynamic ? ' dynamic' : ''}">${esc(node.seg)}</span>`
    const title = node.route ? nodeTitleHtml(node.route) : ''
    const childHtml = kids.length ? `<ul>${kids.map((k) => renderTreeHtml(k, false)).join('')}</ul>` : ''
    return `<li>${seg}${title}${childHtml}</li>`
}

function inventoryRows(routes: RouteEntry[]): string {
    return routes
        .map((r) => {
            if (!r.primary.length) {
                return `<tr class="missing"><td class="url">${esc(r.url)}</td><td class="ttl"><em>no &lt;Title&gt; found</em></td><td class="src">${esc(r.pageFile)}</td></tr>`
            }
            return r.primary
                .map((t, i) => {
                    const flags = [
                        t.order > 1 ? `<span class="hbadge">h${t.order}</span>` : '',
                        t.dynamic ? '<span class="hbadge">dynamic</span>' : '',
                        t.external ? '<span class="hbadge ext">from import</span>' : '',
                    ].join('')
                    return (
                        `<tr><td class="url">${i === 0 ? esc(r.url) : ''}</td>` +
                        `<td class="ttl ${t.dynamic ? 'dyn' : ''}">${esc(t.text)}${flags}</td>` +
                        `<td class="src">${esc(t.file)}</td></tr>`
                    )
                })
                .join('')
        })
        .join('')
}

function renderHtml(routes: RouteEntry[], tree: TreeNode): string {
    const total = routes.length
    const withHeading = routes.filter((r) => r.primary.length).length
    const primaryCount = routes.reduce((n, r) => n + r.primary.length, 0)
    const subCount = routes.reduce((n, r) => n + r.secondary.length, 0)
    const generated = new Date().toISOString()

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>SafeInsights Management App — Sitemap</title>
<style>
  :root { color-scheme: light dark; --fg:#1a1a1a; --bg:#fafafa; --muted:#888; --line:rgba(127,127,127,.25);
          --primary:#291bc4; --primary-bg:rgba(79,66,230,.13); --sub:#555; --sub-bg:rgba(127,127,127,.14);
          --dyn:#b06f00; --dyn-bg:rgba(255,195,15,.18); }
  @media (prefers-color-scheme: dark) { :root { --fg:#e6e6e6; --bg:#14151a; --muted:#8a8f98;
          --primary:#a7a0f3; --sub:#b8bdc4; --dyn:#ffd042; } }
  * { box-sizing: border-box; }
  body { font-family: 'Open Sans', system-ui, sans-serif; margin: 0; padding: 2rem; line-height: 1.55;
         background: var(--bg); color: var(--fg); }
  h1 { font-size: 1.6rem; margin: 0 0 .25rem; }
  .meta { color: var(--muted); font-size: .85rem; margin-bottom: 1.5rem; }
  .meta code { background: var(--sub-bg); padding: 1px 5px; border-radius: 4px; }
  .stats { display: flex; gap: .75rem; flex-wrap: wrap; margin-bottom: 1.5rem; }
  .stat { background: var(--sub-bg); border-radius: 8px; padding: .7rem 1rem; min-width: 110px; }
  .stat b { display: block; font-size: 1.5rem; }
  .stat span { font-size: .78rem; color: var(--muted); }
  h2 { font-size: 1.15rem; margin: 2rem 0 .5rem; }
  .legend { font-size: .8rem; color: var(--muted); margin: 0 0 1rem; }
  .controls { margin: 0 0 1rem; font-size: .82rem; }
  .controls button { font: inherit; cursor: pointer; border: 1px solid var(--line); background: transparent;
          color: var(--fg); border-radius: 6px; padding: .25rem .6rem; margin-right: .4rem; }
  ul.tree, ul.tree ul { list-style: none; margin: 0; padding-left: 1.15rem; }
  ul.tree { padding-left: 0; }
  ul.tree li { position: relative; padding: 3px 0; border-left: 1px solid var(--line); padding-left: .9rem; }
  ul.tree > li { border-left: none; padding-left: 0; }
  .seg { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .9rem; font-weight: 600; }
  .seg.dynamic { color: var(--dyn); background: var(--dyn-bg); padding: 0 5px; border-radius: 4px; font-weight: 600; }
  .primaries { margin-left: .5rem; }
  .chip { display: inline-block; border-radius: 5px; padding: 1px 7px; margin: 2px 3px; font-size: .82rem;
          vertical-align: middle; }
  .chip.primary { background: var(--primary-bg); color: var(--primary); font-weight: 600; }
  .chip.sub { background: var(--sub-bg); color: var(--sub); font-size: .78rem; }
  .chip.dyn { font-style: italic; }
  .hbadge { font-size: .66rem; opacity: .7; margin-left: 5px; border: 1px solid var(--line); border-radius: 3px;
            padding: 0 3px; vertical-align: middle; }
  .hbadge.ext { border: none; }
  .notitle { margin-left: .5rem; color: var(--muted); font-size: .78rem; font-style: italic; }
  details.subs { display: inline-block; margin-left: .4rem; vertical-align: middle; }
  details.subs > summary { cursor: pointer; color: var(--muted); font-size: .76rem; list-style: none;
          border: 1px dashed var(--line); border-radius: 5px; padding: 0 6px; display: inline-block; }
  details.subs > summary::-webkit-details-marker { display: none; }
  details.subs[open] > summary { margin-bottom: 3px; }
  .sublist { display: block; padding-left: .3rem; }
  table { border-collapse: collapse; width: 100%; font-size: .85rem; }
  th, td { text-align: left; padding: .45rem .6rem; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { position: sticky; top: 0; background: var(--bg); }
  td.url { font-family: ui-monospace, monospace; white-space: nowrap; }
  td.ttl { font-weight: 600; }
  td.ttl.dyn { font-style: italic; font-weight: 400; }
  td.src { font-family: ui-monospace, monospace; color: var(--muted); font-size: .78rem; }
  tr.missing td.ttl { color: var(--muted); font-weight: 400; }
</style>
</head>
<body>
  <h1>SafeInsights Management App — Sitemap</h1>
  <p class="meta">Generated ${esc(generated)} from <code>src/app/**/page.tsx</code>. Regenerate with <code>pnpm run sitemap</code>.</p>

  <div class="stats">
    <div class="stat"><b>${total}</b><span>routes (pages)</span></div>
    <div class="stat"><b>${withHeading}</b><span>with a heading found</span></div>
    <div class="stat"><b>${primaryCount}</b><span>page headings</span></div>
    <div class="stat"><b>${subCount}</b><span>sub-headings (h2–h6)</span></div>
    <div class="stat"><b>${total - withHeading}</b><span>no heading found</span></div>
  </div>

  <h2>Route tree</h2>
  <p class="legend"><span class="seg dynamic">[segment]</span> = dynamic route param. <span class="chip primary">Purple chip</span> = the page heading UX would edit; a page can show more than one when the heading is stateful. <span class="hbadge">h2</span> = page has no h1 and uses this heading level instead. <em>Italic</em> = dynamic/interpolated text. <span class="hbadge ext">↗</span> = heading found in an imported component. Sub-headings (section/card/modal titles) are collapsed behind the <em>+N</em> toggles.</p>
  <div class="controls">
    <button onclick="document.querySelectorAll('details.subs').forEach(d=>d.open=true)">Expand all sub-headings</button>
    <button onclick="document.querySelectorAll('details.subs').forEach(d=>d.open=false)">Collapse all</button>
  </div>
  ${renderTreeHtml(tree)}

  <h2>Page heading inventory</h2>
  <p class="legend">One row per page heading. Because there is no shared page-title component, each is defined individually in the listed file. The <span class="hbadge">h2</span> badge marks pages that render no h1. Sub-headings are shown only in the tree above.</p>
  <table>
    <thead><tr><th>Route</th><th>Page heading</th><th>Source file</th></tr></thead>
    <tbody>${inventoryRows(routes)}</tbody>
  </table>
</body>
</html>
`
}

// ---- main -------------------------------------------------------------------

const out = (s: string) => process.stdout.write(s + '\n')

const routes = buildRoutes()
const tree = buildTree(routes)

out(renderAscii(tree))
const primaryTotal = routes.reduce((n, r) => n + r.primary.length, 0)
const subTotal = routes.reduce((n, r) => n + r.secondary.length, 0)
out(`\n${routes.length} routes · ${primaryTotal} page headings · ${subTotal} sub-headings`)

writeFileSync(OUTPUT, renderHtml(routes, tree), 'utf8')
out(`\nHTML sitemap written to ${OUTPUT}`)
