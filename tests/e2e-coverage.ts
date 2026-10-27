// Maps every page route (src/lib/routes/definitions.ts) and API route (src/app/api/**/route.ts) to
// the e2e specs that drive it, so "complete" is a number rather than a feeling.
//
//   pnpm exec tsx tests/e2e-coverage.ts --write   regenerates docs/e2e-coverage.md
//   pnpm exec tsx tests/e2e-coverage.ts --check   fails on an uncovered route with no exception, or a
//                                                stale exception; never writes
//
// A spec counts as driving a route when it references `Routes.<name>`, holds the route's full path
// (any value in a dynamic segment), or ends a URL assertion with the route's own tail — only when
// that tail belongs to one route, so `/dashboard` is not credited to the org dashboard. A route that a
// flow module reaches is credited to the specs that import that module. Heuristic by design: it
// never proves an assertion exists, it stops a page from being added with no spec at all.
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'
import * as prettier from 'prettier'
import { E2E_COVERAGE_EXCEPTIONS } from './e2e-coverage.exceptions'

const ROOT = process.cwd()
const DOC = 'docs/e2e-coverage.md'
const ROUTE_DEFINITIONS = 'src/lib/routes/definitions.ts'
const API_DIR = 'src/app/api'
const TESTS_DIR = 'tests'
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

type RouteEntry = { key: string; label: string; template: string }

function walk(dir: string, matches: (file: string) => boolean, out: string[] = []): string[] {
    if (!fs.existsSync(dir)) return out
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) walk(full, matches, out)
        } else if (matches(full)) {
            out.push(full)
        }
    }
    return out
}

// `/${orgSlug}/study/${studyId}/view` becomes `/{orgSlug}/study/{studyId}/view`.
function templateText(node: ts.Expression): string | null {
    if (ts.isNoSubstitutionTemplateLiteral(node) || ts.isStringLiteral(node)) return node.text
    if (ts.isTemplateExpression(node)) {
        return (
            node.head.text +
            node.templateSpans.map((span) => `{${span.expression.getText()}}${span.literal.text}`).join('')
        )
    }
    if (ts.isAsExpression(node) || ts.isParenthesizedExpression(node)) return templateText(node.expression)
    if (ts.isCallExpression(node) && node.arguments[0]) return templateText(node.arguments[0])
    if (ts.isArrowFunction(node)) {
        if (ts.isBlock(node.body)) return null
        return templateText(node.body)
    }
    return null
}

function pageRoutes(): RouteEntry[] {
    const file = path.join(ROOT, ROUTE_DEFINITIONS)
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
    const routes: RouteEntry[] = []
    const visit = (node: ts.Node) => {
        if (ts.isVariableDeclaration(node) && node.name.getText() === 'Routes' && node.initializer) {
            let init: ts.Expression = node.initializer
            while (ts.isAsExpression(init) || ts.isSatisfiesExpression(init)) init = init.expression
            if (!ts.isObjectLiteralExpression(init)) return
            for (const property of init.properties) {
                if (!ts.isPropertyAssignment(property)) continue
                const name = property.name.getText()
                const template = templateText(property.initializer)
                if (template) routes.push({ key: name, label: `Routes.${name}`, template })
            }
        }
        ts.forEachChild(node, visit)
    }
    visit(source)
    return routes
}

function apiRoutes(): RouteEntry[] {
    const files = walk(path.join(ROOT, API_DIR), (file) => file.endsWith('/route.ts'))
    const routes: RouteEntry[] = []
    for (const file of files.sort()) {
        const content = fs.readFileSync(file, 'utf8')
        const routePath = '/' + path.relative(path.join(ROOT, 'src/app'), path.dirname(file)).split(path.sep).join('/')
        const template = routePath.replace(/\[([^\]]+)\]/g, '{$1}')
        for (const method of HTTP_METHODS) {
            const exported = new RegExp(`^export (?:const|async function|function) ${method}\\b`, 'm').test(content)
            if (exported) routes.push({ key: `${method} ${template}`, label: `${method} ${template}`, template })
        }
    }
    return routes
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// The static text after the last dynamic segment, the part a `waitForURL(/\/review\/code$/)` names.
function tailOf(template: string): string {
    const index = template.lastIndexOf('}')
    return index < 0 ? template : template.slice(index + 1)
}

function fullPathPattern(template: string): RegExp {
    const body = template
        .split(/(\{[^}]+\})/)
        .map((part) => (part.startsWith('{') ? `[^/'"\`\\s?#),]+` : escapeRegExp(part)))
        .join('')
    return new RegExp(`(?<![\\w/])${body}(?=$|[\\s'"\`?#),/]|\\(|\\$)`, 'm')
}

type Scan = { file: string; text: string; imports: Set<string> }

function scanTestFile(file: string): Scan {
    const raw = fs.readFileSync(file, 'utf8')
    // A regex literal in a spec escapes its slashes; the tail logic below wants plain paths.
    const text = raw.replace(/\\\//g, '/')
    const imports = new Set<string>()
    for (const match of raw.matchAll(/from\s+'(\.[^']+)'/g)) {
        imports.add(path.normalize(path.join(path.dirname(file), match[1])).replace(/\.ts$/, ''))
    }
    return { file, text, imports }
}

// `/\/submitted(\?.*)?$/`, `/\/review\/code$/` and `'**/view'` all name a tail.
function assertedTails(text: string): Set<string> {
    const tails = new Set<string>()
    for (const match of text.matchAll(/(\/[\w-]+(?:\/[\w-]+)*)(?:\(\\\?\.\*\)\?)?\$/g)) tails.add(match[1])
    for (const match of text.matchAll(/\*\*(\/[\w-]+(?:\/[\w-]+)*)['"`]/g)) tails.add(match[1])
    return tails
}

function routeMentioned(route: RouteEntry, scan: Scan, uniqueTails: Set<string>): boolean {
    if (route.label.startsWith('Routes.') && new RegExp(`\\bRoutes\\.${route.key}\\b`).test(scan.text)) return true
    if (route.template === '/') return /['"`]\/['"`]/.test(scan.text)
    if (fullPathPattern(route.template).test(scan.text)) return true
    const tail = tailOf(route.template)
    return tail !== route.template && uniqueTails.has(tail) && assertedTails(scan.text).has(tail)
}

function relative(file: string) {
    return path.relative(ROOT, file).split(path.sep).join('/')
}

function coverage() {
    const routes = [...pageRoutes(), ...apiRoutes()]
    const tails = routes.map((route) => tailOf(route.template)).filter((tail) => tail !== '' && tail !== '/')
    const uniqueTails = new Set(tails.filter((tail) => tails.indexOf(tail) === tails.lastIndexOf(tail)))

    const specs = walk(path.join(ROOT, TESTS_DIR), (file) => file.endsWith('.spec.ts'))
        .sort()
        .map(scanTestFile)
    const modules = walk(
        path.join(ROOT, TESTS_DIR),
        (file) => /\/(flows|api)\/.*\.ts$/.test(file) && !file.endsWith('.spec.ts'),
    )
        .sort()
        .map(scanTestFile)

    const coveredBy = new Map<string, Set<string>>()
    const credit = (route: RouteEntry, spec: Scan) => {
        const set = coveredBy.get(route.key) ?? new Set<string>()
        set.add(relative(spec.file))
        coveredBy.set(route.key, set)
    }
    for (const route of routes) {
        for (const spec of specs) {
            if (routeMentioned(route, spec, uniqueTails)) credit(route, spec)
            for (const helper of modules) {
                const helperId = helper.file.replace(/\.ts$/, '')
                const viaIndex = path.basename(helperId) === 'index' && spec.imports.has(path.dirname(helperId))
                if ((spec.imports.has(helperId) || viaIndex) && routeMentioned(route, helper, uniqueTails))
                    credit(route, spec)
            }
        }
    }
    return { routes, coveredBy }
}

async function render(routes: RouteEntry[], coveredBy: Map<string, Set<string>>): Promise<string> {
    const pages = routes.filter((route) => route.label.startsWith('Routes.'))
    const api = routes.filter((route) => !route.label.startsWith('Routes.'))
    const covered = (list: RouteEntry[]) => list.filter((route) => coveredBy.has(route.key)).length
    const row = (route: RouteEntry) => {
        const specs = coveredBy.get(route.key)
        const exception = E2E_COVERAGE_EXCEPTIONS[route.label]
        const by = specs
            ? [...specs].map((spec) => `\`${spec}\``).join(', ')
            : exception
              ? `— (${exception})`
              : '**none**'
        return `| ${route.label} | \`${route.template}\` | ${by} |`
    }
    const markdown = [
        '# E2E coverage map',
        '',
        'Generated by `pnpm run e2e:coverage-map` from `src/lib/routes/definitions.ts` and `src/app/api/**/route.ts`.',
        'Do not edit by hand; the heuristic that credits a spec is described at the top of `tests/e2e-coverage.ts`.',
        'Routes with no spec and a reason are listed in `tests/e2e-coverage.exceptions.ts`.',
        '',
        `## Pages (${covered(pages)} of ${pages.length} covered)`,
        '',
        '| Route | Path | Covered by |',
        '| --- | --- | --- |',
        ...pages.map(row),
        '',
        `## API (${covered(api)} of ${api.length} covered)`,
        '',
        '| Route | Path | Covered by |',
        '| --- | --- | --- |',
        ...api.map(row),
        '',
    ].join('\n')
    // The doc is checked in, so it must pass the same `prettier --check` as everything else.
    const docPath = path.join(ROOT, DOC)
    return prettier.format(markdown, { ...(await prettier.resolveConfig(docPath)), filepath: docPath })
}

function problems(routes: RouteEntry[], coveredBy: Map<string, Set<string>>): string[] {
    const errors: string[] = []
    for (const route of routes) {
        if (!coveredBy.has(route.key) && !E2E_COVERAGE_EXCEPTIONS[route.label]) {
            errors.push(
                `${route.label} (${route.template}) has no e2e spec; add one or list it in tests/e2e-coverage.exceptions.ts`,
            )
        }
    }
    for (const label of Object.keys(E2E_COVERAGE_EXCEPTIONS)) {
        const route = routes.find((candidate) => candidate.label === label)
        if (!route) errors.push(`stale exception ${label}: no such route`)
        else if (coveredBy.has(route.key))
            errors.push(`stale exception ${label}: it is covered by ${[...coveredBy.get(route.key)!].join(', ')}`)
    }
    return errors
}

const args = process.argv.slice(2)
const { routes, coveredBy } = coverage()
const markdown = await render(routes, coveredBy)

if (args.includes('--check')) {
    const errors = problems(routes, coveredBy)
    const current = fs.existsSync(path.join(ROOT, DOC)) ? fs.readFileSync(path.join(ROOT, DOC), 'utf8') : ''
    if (current !== markdown) errors.push(`${DOC} is out of date; run pnpm run e2e:coverage-map`)
    if (errors.length) {
        console.error('e2e coverage check failed:')
        for (const error of errors) console.error(`   ✗ ${error}`)
        process.exit(1)
    }
} else {
    fs.writeFileSync(path.join(ROOT, DOC), markdown)
    const uncovered = routes.filter((route) => !coveredBy.has(route.key) && !E2E_COVERAGE_EXCEPTIONS[route.label])
    console.warn(`${DOC}: ${routes.length - uncovered.length} of ${routes.length} routes covered or excepted`)
    for (const route of uncovered) console.warn(`   ✗ ${route.label} (${route.template})`)
}
