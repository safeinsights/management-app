import { readdirSync, readFileSync } from 'fs'
import path from 'path'
import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

const MIGRATIONS_DIR = path.join(__dirname, 'migrations')
const migrationFiles = () => readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.ts'))

// OTTER-794: earlier migrations predate the retroactive-change rule; see docs/retroactive-changes.md.
const RETROACTIVE_RULE_SINCE = 1787300000000

// Widens a study-family table or enum: existing studies would otherwise fall behind new ones.
// Every table with a study_id column, not just the study-prefixed ones.
const STUDY_TABLES = '(study\\w*|job_status_change|yjs_document|workspace_file_activity|legal_document\\w*)'
const STUDY_TABLE = new RegExp(`^${STUDY_TABLES}$`)
const STUDY_ENUM = /^study\w*$/
const OPT_OUT = /no backfill:/

const QNAME = String.raw`(?:"[^"]+"|\w+)(?:\s*\.\s*(?:"[^"]+"|\w+))*`
// Quoted identifiers are matched only so that a -- inside one is not read as a comment.
const SQL_LEXEMES =
    /"(?:[^"]|"")*"|\b[eE]'(?:[^'\\]|\\[\s\S]|'')*'|'(?:[^']|'')*'|\$([A-Za-z_]\w*)?\$([\s\S]*?)\$\1\$|--[^\n]*|\/\*[\s\S]*?\*\//g
const RAW_ALTER_TABLE = new RegExp(String.raw`\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(${QNAME})([^;]*)`, 'gi')
const ADDS_COLUMN = /(?:^|,)\s*ADD\s+(?!\s|CONSTRAINT\b|CHECK\b|UNIQUE\b|PRIMARY\b|EXCLUDE\b|FOREIGN\b)/i
const RAW_CREATE_TABLE = new RegExp(
    String.raw`\bCREATE\s+(?:UNLOGGED\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(${QNAME})`,
    'gi',
)
const RAW_ADD_VALUE = new RegExp(String.raw`\bALTER\s+TYPE\s+(${QNAME})\s+ADD\s+VALUE\b`, 'gi')
const RAW_CREATE_ENUM = new RegExp(String.raw`\bCREATE\s+TYPE\s+(${QNAME})\s+AS\s+ENUM\b`, 'gi')
const RAW_BACKFILL = new RegExp(String.raw`\b(?:UPDATE\s+(?:ONLY\s+)?|INSERT\s+INTO\s+)(${QNAME})`, 'gi')

// A builder table name the guard cannot read, such as a loop variable, may be a study table.
const UNRESOLVED = '<unresolved table>'

type Found = { widened: Set<string>; enums: Set<string>; createdEnums: Set<string>; backfilled: Set<string> }
type Consts = Map<string, ts.Expression | undefined>

const builderTable = (raw: string) =>
    raw
        .trim()
        .split(/\s+/)[0]
        .split('.')
        .at(-1)!
        .replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)

const sqlName = (qname: string) => {
    const last = qname.match(/"[^"]+"|\w+/g)!.at(-1)!
    return last.startsWith('"') ? last.slice(1, -1) : last.toLowerCase()
}

function moduleFunctions(sourceFile: ts.SourceFile) {
    const functions = new Map<string, ts.Node>()
    for (const statement of sourceFile.statements) {
        if (ts.isFunctionDeclaration(statement) && statement.name && statement.body) {
            functions.set(statement.name.text, statement.body)
        }
        if (!ts.isVariableStatement(statement)) continue
        for (const { name, initializer } of statement.declarationList.declarations) {
            if (!ts.isIdentifier(name) || !initializer) continue
            if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) {
                functions.set(name.text, initializer.body)
            }
        }
    }
    return functions
}

function constInitializers(sourceFile: ts.SourceFile) {
    const consts: Consts = new Map()
    const visit = (node: ts.Node) => {
        // A name bound twice, or bound without a value such as a loop variable, stays unresolved.
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
            consts.set(node.name.text, consts.has(node.name.text) ? undefined : node.initializer)
        }
        ts.forEachChild(node, visit)
    }
    visit(sourceFile)
    return consts
}

function calledNames(body: ts.Node) {
    const names = new Set<string>()
    const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node)) {
            for (const target of [node.expression, ...node.arguments]) {
                if (ts.isIdentifier(target)) names.add(target.text)
            }
        }
        ts.forEachChild(node, visit)
    }
    visit(body)
    return names
}

// Backfills live in exported helpers so their own tests can call them, so calls are followed.
function reach(functions: Map<string, ts.Node>, start: string) {
    const reached = new Set<string>()
    const queue = [start]
    while (queue.length) {
        const name = queue.pop()!
        const body = functions.get(name)
        if (!body || reached.has(name)) continue
        reached.add(name)
        queue.push(...[...calledNames(body)].filter((called) => called !== 'down'))
    }
    return reached
}

const isFunction = (node: ts.Node): node is ts.FunctionLikeDeclaration =>
    ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)

// A nested function runs when it is called by name, invoked in place, or handed to a call as rows.map(async (r) => ...).
function runs(fn: ts.FunctionLikeDeclaration, called: Set<string>) {
    let parent = fn.parent
    while (ts.isParenthesizedExpression(parent)) parent = parent.parent
    if (ts.isCallExpression(parent) || ts.isNewExpression(parent)) return true
    const name = ts.isFunctionDeclaration(fn) ? fn.name : ts.isVariableDeclaration(parent) ? parent.name : undefined
    return !!name && ts.isIdentifier(name) && called.has(name.text)
}

const calleeName = (call: ts.CallExpression) => {
    const callee = call.expression
    if (ts.isPropertyAccessExpression(callee)) return callee.name.text
    return ts.isIdentifier(callee) ? callee.text : undefined
}

const literalArg = (call: ts.CallExpression) => {
    const arg = call.arguments[0]
    return arg && ts.isStringLiteralLike(arg) ? arg.text : undefined
}

const stringValue = (node: ts.Expression | undefined, consts: Consts) => {
    const value = node && ts.isIdentifier(node) ? consts.get(node.text) : node
    return value && ts.isStringLiteralLike(value) ? value.text : undefined
}

// undefined for a createTable chain, which collectCall reads from the createTable call itself.
function alteredTable(addColumn: ts.CallExpression, consts: Consts) {
    const seen = new Set<ts.Node>()
    let node: ts.Expression | undefined = addColumn.expression
    while (node && !seen.has(node)) {
        seen.add(node)
        if (ts.isCallExpression(node) && calleeName(node) === 'createTable') return undefined
        if (ts.isCallExpression(node) && calleeName(node) === 'alterTable') {
            return stringValue(node.arguments[0], consts) ?? UNRESOLVED
        }
        if (ts.isIdentifier(node)) node = consts.get(node.text)
        else if (ts.isPropertyAccessExpression(node) || ts.isCallExpression(node)) node = node.expression
        else if (ts.isParenthesizedExpression(node) || ts.isAwaitExpression(node)) node = node.expression
        else break
    }
    return UNRESOLVED
}

function collectCall(call: ts.CallExpression, consts: Consts, found: Found) {
    const name = calleeName(call)
    if (name === 'addColumn') {
        const table = alteredTable(call, consts)
        if (table) found.widened.add(table === UNRESOLVED ? table : builderTable(table))
        return
    }
    const target = stringValue(call.arguments[0], consts)
    if (name === 'createTable') found.widened.add(target ? builderTable(target) : UNRESOLVED)
    if (name === 'createType') found.createdEnums.add(target ? builderTable(target) : UNRESOLVED)
    if (target && (name === 'updateTable' || name === 'insertInto')) found.backfilled.add(builderTable(target))
}

function sqlText(node: ts.Node) {
    if (ts.isTaggedTemplateExpression(node) && ts.isIdentifier(node.tag) && node.tag.text === 'sql') {
        const { template } = node
        if (ts.isNoSubstitutionTemplateLiteral(template)) return template.text
        return template.head.text + template.templateSpans.map((span) => ` \${} ${span.literal.text}`).join('')
    }
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return
    const { expression: receiver, name } = node.expression
    if (ts.isIdentifier(receiver) && receiver.text === 'sql' && name.text === 'raw') return literalArg(node)
}

const stripSql = (text: string, keepDollarBodies: boolean): string =>
    text.replace(SQL_LEXEMES, (match, _tag, dollarBody: string | undefined) => {
        if (match.startsWith('"')) return match
        return keepDollarBodies && dollarBody !== undefined ? ` ${stripSql(dollarBody, true)} ` : ' '
    })

// A dollar-quoted body may run (DO $$ ... $$) or only be stored (a function body), so it can widen but never backfill.
function collectSql(text: string, found: Found) {
    const all = stripSql(text, true)
    for (const [, table, actions] of all.matchAll(RAW_ALTER_TABLE)) {
        if (ADDS_COLUMN.test(actions)) found.widened.add(sqlName(table))
    }
    for (const [, table] of all.matchAll(RAW_CREATE_TABLE)) found.widened.add(sqlName(table))
    for (const [, type] of all.matchAll(RAW_ADD_VALUE)) found.enums.add(sqlName(type))
    for (const [, type] of all.matchAll(RAW_CREATE_ENUM)) found.createdEnums.add(sqlName(type))
    for (const [, table] of stripSql(text, false).matchAll(RAW_BACKFILL)) found.backfilled.add(sqlName(table))
}

function collect(roots: ts.Node[], consts: Consts, skip: (node: ts.Node) => boolean) {
    const found: Found = { widened: new Set(), enums: new Set(), createdEnums: new Set(), backfilled: new Set() }
    const visit = (node: ts.Node) => {
        if (skip(node)) return
        if (ts.isCallExpression(node)) collectCall(node, consts, found)
        const text = sqlText(node)
        if (text !== undefined) collectSql(text, found)
        ts.forEachChild(node, visit)
    }
    roots.forEach(visit)
    return found
}

function missingBackfills(source: string): string[] {
    if (OPT_OUT.test(source)) return []
    const sourceFile = ts.createSourceFile('migration.ts', source, ts.ScriptTarget.Latest, true)
    const functions = moduleFunctions(sourceFile)
    if (!functions.has('up')) return ['no up() function']

    const consts = constInitializers(sourceFile)
    const bodies = (names: string[]) => names.map((name) => functions.get(name)!)
    const upBodies = bodies([...reach(functions, 'up')])
    const upReach = new Set(upBodies)
    const downOnly = new Set(bodies([...reach(functions, 'down')]).filter((body) => !upReach.has(body)))
    const called = new Set(upBodies.flatMap((body) => [...calledNames(body)]))
    // Widenings are read more broadly than backfills, so a miss asks for a backfill instead of passing.
    const { widened, enums, createdEnums } = collect([sourceFile], consts, (node) => downOnly.has(node))
    const { backfilled } = collect(upBodies, consts, (node) => isFunction(node) && !runs(node, called))

    const tables = [...widened].filter(
        (table) => (STUDY_TABLE.test(table) || table === UNRESOLVED) && !backfilled.has(table),
    )
    // A new enum value cannot be written before the migration's transaction commits, so no backfill covers it.
    const studyEnums = [...enums].filter((type) => STUDY_ENUM.test(type))
    // A rebuilt type can hold a value old rows need, so a study enum created here needs a study-table backfill.
    const backfillsStudies = [...backfilled].some((table) => STUDY_TABLE.test(table))
    const createdStudyEnums = [...createdEnums].filter(
        (type) => (STUDY_ENUM.test(type) || type === UNRESOLVED) && !backfillsStudies,
    )
    return [...new Set([...tables, ...studyEnums, ...createdStudyEnums])].sort()
}

describe('migrations', () => {
    it('has no duplicate timestamps', () => {
        const files = migrationFiles()
        const timestamps = files.map((f) => f.split('_')[0])
        const dupes = timestamps.filter((t, i) => timestamps.indexOf(t) !== i)
        expect(dupes, `Duplicate migration timestamps: ${dupes.join(', ')}`).toEqual([])
    })

    it('brings existing studies along when widening a study-family table or enum', () => {
        const offenders = migrationFiles()
            .filter((f) => Number(f.split('_')[0]) >= RETROACTIVE_RULE_SINCE)
            .map((f) => ({ f, gaps: missingBackfills(readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8')) }))
            .filter(({ gaps }) => gaps.length > 0)
            .map(({ f, gaps }) => `${f}: ${gaps.join(', ')}`)
        expect(
            offenders,
            'Backfill each widened table in up() or a same-file function it calls, on that same table, or add a ' +
                '`// no backfill: <why existing studies are unaffected>` comment. A new study enum value always ' +
                'needs the marker with a true reason: Postgres cannot use it before the migration commits ' +
                '(docs/retroactive-changes.md)',
        ).toEqual([])
    })
})

describe('missingBackfills', () => {
    const migration = ({ top = [], up = [], down = [] }: { top?: string[]; up?: string[]; down?: string[] }) =>
        [
            "import { sql } from 'kysely'",
            ...top,
            'export async function up(db) {',
            ...up,
            '}',
            'export async function down(db) {',
            ...down,
            '}',
        ].join('\n')
    const fn = (name: string, body: string[]) => [`async function ${name}(db) {`, ...body, '}'].join('\n')
    const run = (query: string) => `await sql\`${query}\`.execute(db)`

    const W = "await db.schema.alterTable('study').addColumn('x', 'text').execute()"
    const UPDATE_STUDY = "await db.updateTable('study').set({ x: 'a' }).execute()"
    const CREATE_STUDY_THING = "await db.schema.createTable('study_thing').addColumn('id', 'uuid').execute()"
    const ADD_TO_JOB_STATUS_CHANGE = "await db.schema.alterTable('job_status_change').addColumn('x', 'text').execute()"

    type Row = [string, string, string[]]
    const check = (_: string, source: string, expected: string[]) => {
        expect(missingBackfills(source)).toEqual(expected)
    }

    it.each<Row>([
        [
            'backfill only on an unrelated table (the card repro)',
            migration({ up: [W, "await db.updateTable('org').set({ y: 1 }).execute()"] }),
            ['study'],
        ],
        ['builder backfill only in down()', migration({ up: [W], down: [UPDATE_STUDY] }), ['study']],
        ['raw backfill only in down()', migration({ up: [W], down: [run("UPDATE study SET x = 'a'")] }), ['study']],
        ['a bare study column', migration({ up: [W] }), ['study']],
        ['a new study table', migration({ up: [CREATE_STUDY_THING] }), ['study_thing']],
        ['a new study enum value', migration({ up: [run("ALTER TYPE study_status ADD VALUE 'X'")] }), ['study_status']],
        ['the no backfill marker', migration({ top: ['// no backfill: reason'], up: [W] }), []],
        [
            'a non-study table',
            migration({ up: ["await db.schema.alterTable('org').addColumn('x', 'text').execute()"] }),
            [],
        ],
    ])('card and QA probes: %s', check)

    it.each<Row>([
        [
            'a backfill in a called helper',
            migration({ top: [fn('backfillX', [run("UPDATE study SET x = 'a'")])], up: [W, 'await backfillX(db)'] }),
            [],
        ],
        [
            'a backfill in a called arrow helper',
            migration({
                top: ['const backfillX = async (db) => {', run("UPDATE study SET x = 'a'"), '}'],
                up: [W, 'await backfillX(db)'],
            }),
            [],
        ],
        [
            'a backfill reached transitively',
            migration({ top: [fn('a', ['await b(db)']), fn('b', [UPDATE_STUDY])], up: [W, 'await a(db)'] }),
            [],
        ],
        ['a backfill in an uncalled helper', migration({ top: [fn('backfillX', [UPDATE_STUDY])], up: [W] }), ['study']],
        [
            'a mention of down is not a call',
            migration({ up: [W, 'console.log(down.name)'], down: [UPDATE_STUDY] }),
            ['study'],
        ],
        [
            'a property access is not a call',
            migration({ top: [fn('backfillX', [UPDATE_STUDY])], up: [W, 'console.log(backfillX.name)'] }),
            ['study'],
        ],
        [
            'a helper passed as a call argument',
            migration({
                top: [fn('backfillOne', [UPDATE_STUDY])],
                up: [W, 'await Promise.all(ids.map(backfillOne))'],
            }),
            [],
        ],
        [
            'an inline callback',
            migration({
                up: [W, "await Promise.all(rows.map(async (r) => db.updateTable('study').set({ x: r }).execute()))"],
            }),
            [],
        ],
        [
            'recursive helpers without a backfill',
            migration({ top: [fn('a', ['await b(db)']), fn('b', ['await a(db)'])], up: [W, 'await a(db)'] }),
            ['study'],
        ],
        [
            'an uncalled nested function',
            migration({ up: [W, 'async function backfillX() {', UPDATE_STUDY, '}'] }),
            ['study'],
        ],
        [
            'an uncalled nested arrow',
            migration({ up: [W, 'const backfillX = async () => {', UPDATE_STUDY, '}'] }),
            ['study'],
        ],
        [
            'a called nested function',
            migration({ up: [W, 'async function backfillX() {', UPDATE_STUDY, '}', 'await backfillX()'] }),
            [],
        ],
        ['a function invoked in place', migration({ up: [W, 'await (async () => {', UPDATE_STUDY, '})()'] }), []],
        ['a widening only in down()', migration({ down: [W] }), []],
        [
            'a widening on another chain than the study alterTable',
            migration({
                up: [
                    "await db.schema.alterTable('study').dropColumn('a').execute()",
                    "await db.schema.alterTable('org').addColumn('b', 'text').execute()",
                ],
            }),
            [],
        ],
    ])('reachability: %s', check)

    it.each<Row>([
        [
            'each widened table needs its own backfill',
            migration({
                up: [W, "await db.schema.alterTable('study_job').addColumn('y', 'text').execute()", UPDATE_STUDY],
            }),
            ['study_job'],
        ],
        [
            'a new table with a backfill on another table',
            migration({ up: [CREATE_STUDY_THING, "await db.insertInto('study').values({}).execute()"] }),
            ['study_thing'],
        ],
        [
            'a new table with its own backfill',
            migration({ up: [CREATE_STUDY_THING, "await db.insertInto('study_thing').values({}).execute()"] }),
            [],
        ],
        [
            'a non-prefixed study-family table',
            migration({
                up: [ADD_TO_JOB_STATUS_CHANGE, "await db.updateTable('workspace_file_activity').set({}).execute()"],
            }),
            ['job_status_change'],
        ],
        [
            'a camelCase builder name with an alias',
            migration({
                up: [ADD_TO_JOB_STATUS_CHANGE, "await db.updateTable('jobStatusChange as j').set({}).execute()"],
            }),
            [],
        ],
    ])('table matching: %s', check)

    it.each<Row>([
        [
            'an alterTable builder in a variable',
            migration({ up: ["const t = db.schema.alterTable('study')", "await t.addColumn('x', 'text').execute()"] }),
            ['study'],
        ],
        [
            'a createTable builder in a variable',
            migration({
                up: ["const t = db.schema.createTable('study_thing')", "await t.addColumn('id', 'uuid').execute()"],
            }),
            ['study_thing'],
        ],
        [
            'a table name in a const',
            migration({
                top: ["const TABLE = 'study'"],
                up: ["await db.schema.alterTable(TABLE).addColumn('x', 'text').execute()"],
            }),
            ['study'],
        ],
        [
            'a table name in a const with its backfill',
            migration({
                top: ["const TABLE = 'study'"],
                up: [
                    "await db.schema.alterTable(TABLE).addColumn('x', 'text').execute()",
                    "await db.updateTable(TABLE).set({ x: 'a' }).execute()",
                ],
            }),
            [],
        ],
        [
            'a loop over table names',
            migration({
                top: ["const TABLES = ['study', 'study_job']"],
                up: [
                    'for (const table of TABLES) {',
                    "await db.schema.alterTable(table).addColumn('x', 'text').execute()",
                    "await db.updateTable(table).set({ x: 'a' }).execute()",
                    '}',
                ],
            }),
            ['<unresolved table>'],
        ],
    ])('builder names: %s', check)

    it.each<Row>([
        [
            'a raw widening and a raw backfill',
            migration({ up: [run('ALTER TABLE study ADD COLUMN x text'), run("UPDATE study SET x = ''")] }),
            [],
        ],
        [
            'qualified and quoted names',
            migration({
                up: [run('ALTER TABLE "public"."study" ADD COLUMN x text'), run("UPDATE public.study SET x = ''")],
            }),
            [],
        ],
        [
            'a quoted widening alone',
            migration({ up: [run('ALTER TABLE "public"."study" ADD COLUMN x text')] }),
            ['study'],
        ],
        ['unquoted names fold to lower case', migration({ up: [W, run("UPDATE STUDY SET x = 'a'")] }), []],
        ['a TypeScript comment', migration({ up: [W, '// UPDATE study SET x = 1'] }), ['study']],
        ['a SQL block comment', migration({ up: [W, run("SELECT 1 /* UPDATE study SET x = 'a' */")] }), ['study']],
        ['a SQL line comment', migration({ up: [W, run('SELECT 1 -- UPDATE study')] }), ['study']],
        ['a SQL string value', migration({ up: [W, run("SELECT 'UPDATE study SET x = 1'")] }), ['study']],
        ['a non-SQL string', migration({ up: [W, "console.log('UPDATE study SET x = 1')"] }), ['study']],
        [
            'a real update next to a comment with a quote, and -- inside a string',
            migration({ up: [W, run("-- don't skip old rows\nUPDATE study SET x = 'a--b'")] }),
            [],
        ],
        [
            'widening text in a SQL comment',
            migration({ up: [run('SELECT 1 -- ALTER TABLE study ADD COLUMN x text')] }),
            [],
        ],
        [
            'a substituted table name',
            migration({ up: [W, run("UPDATE ${sql.table('study')} SET x = 'a'")] }),
            ['study'],
        ],
        ['a sql.raw argument', migration({ up: [W, "await sql.raw('UPDATE study SET x = 1').execute(db)"] }), []],
        ['a dollar-quoted string', migration({ up: [W, run('SELECT $$UPDATE study SET x = 1$$')] }), ['study']],
        [
            'a tagged dollar-quoted string',
            migration({ up: [W, run('SELECT $text$UPDATE study SET x = 1$text$')] }),
            ['study'],
        ],
        [
            'a widening inside a DO block',
            migration({ up: [run('DO $$ BEGIN ALTER TABLE study ADD COLUMN x text; END $$')] }),
            ['study'],
        ],
        [
            'an escape string with an escaped quote',
            migration({ up: [run("SELECT E'it\\\\'s'; ALTER TABLE study_job ADD COLUMN y text; SELECT 'z'")] }),
            ['study_job'],
        ],
        [
            'a -- inside a quoted identifier',
            migration({ up: [run('ALTER TABLE "a--b" ADD COLUMN q int; ALTER TABLE study ADD COLUMN x text')] }),
            ['study'],
        ],
    ])('SQL text: %s', check)

    const ADD_STUDY_STATUS = run("ALTER TYPE study_status ADD VALUE 'X'")
    it.each<Row>([
        [
            'a backfill does not cover a new value',
            migration({ up: [ADD_STUDY_STATUS, UPDATE_STUDY] }),
            ['study_status'],
        ],
        [
            'the marker covers a new value',
            migration({
                top: ['// no backfill: the value records an event that could not happen before'],
                up: [ADD_STUDY_STATUS, UPDATE_STUDY],
            }),
            [],
        ],
        [
            'a rebuilt study enum without a backfill',
            migration({ up: [run('DROP TYPE study_status'), run("CREATE TYPE study_status AS ENUM ('A', 'B')")] }),
            ['study_status'],
        ],
        [
            'a rebuilt study enum with a study backfill',
            migration({
                up: [
                    run('DROP TYPE study_status'),
                    run("CREATE TYPE study_status AS ENUM ('A', 'B')"),
                    run("UPDATE study SET status = 'B'"),
                ],
            }),
            [],
        ],
        [
            'a rebuilt study enum with a backfill on another table',
            migration({
                up: [
                    run("CREATE TYPE study_status AS ENUM ('A', 'B')"),
                    "await db.updateTable('org').set({ y: 1 }).execute()",
                ],
            }),
            ['study_status'],
        ],
        [
            'a builder study enum',
            migration({ up: ["await db.schema.createType('study_kind').asEnum(['A']).execute()"] }),
            ['study_kind'],
        ],
    ])('enum values: %s', check)

    it.each<Row>([
        ['an uncalled widening helper', migration({ top: [fn('addX', [W])] }), ['study']],
        [
            'a helper shared by up() and down()',
            migration({ top: [fn('addX', [W])], up: ['await addX(db)'], down: ['await addX(db)'] }),
            ['study'],
        ],
        ['a helper only down() calls', migration({ top: [fn('addX', [W])], down: ['await addX(db)'] }), []],
        [
            'a module-level sql constant',
            migration({ top: ['const ADD = sql`ALTER TABLE study ADD COLUMN x text`'], up: ['await ADD.execute(db)'] }),
            ['study'],
        ],
    ])('widening scope: %s', check)

    it.each<Row>([
        ['several actions', migration({ up: [run('ALTER TABLE study DROP COLUMN a, ADD COLUMN b text')] }), ['study']],
        ['ADD without COLUMN', migration({ up: [run('ALTER TABLE study ADD b text')] }), ['study']],
        [
            'DO UPDATE adds no study table',
            migration({ up: [W, run('INSERT INTO org (id) VALUES (1) ON CONFLICT (id) DO UPDATE SET y = 1')] }),
            ['study'],
        ],
        [
            'constraint forms with a comma inside parentheses',
            migration({
                up: [
                    run(
                        'ALTER TABLE study ADD CONSTRAINT c CHECK (a IN (1, 2)), ADD PRIMARY KEY (id), ADD UNIQUE (b), ' +
                            'ADD FOREIGN KEY (c) REFERENCES org(id), ADD EXCLUDE USING gist (d WITH =)',
                    ),
                ],
            }),
            [],
        ],
        [
            'a constraint on the next line',
            migration({ up: [run('ALTER TABLE study\n    ADD\n        CONSTRAINT c UNIQUE (b)')] }),
            [],
        ],
        [
            'optional keywords',
            migration({ up: [run('ALTER TABLE IF EXISTS ONLY study ADD COLUMN IF NOT EXISTS x text')] }),
            ['study'],
        ],
        [
            'the action list stops at a semicolon',
            migration({ up: [run('ALTER TABLE org DROP COLUMN a; ALTER TABLE study ADD COLUMN b text')] }),
            ['study'],
        ],
    ])('raw ALTER TABLE: %s', check)

    it.each<Row>([
        ['a raw new study table', migration({ up: [run('CREATE TABLE study_foo (id uuid)')] }), ['study_foo']],
        [
            'a raw new study table with its own backfill',
            migration({
                up: [
                    run('CREATE TABLE IF NOT EXISTS study_foo (id uuid)'),
                    run('INSERT INTO study_foo (id) SELECT id FROM study'),
                ],
            }),
            [],
        ],
    ])('raw CREATE TABLE: %s', check)

    it('reports a file without up()', () => {
        expect(missingBackfills('export async function down(db) {}')).toEqual(['no up() function'])
    })
})
