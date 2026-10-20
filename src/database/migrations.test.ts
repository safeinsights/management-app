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
const SQL_STRINGS_AND_COMMENTS = /'(?:[^']|'')*'|--[^\n]*|\/\*[\s\S]*?\*\//g
const RAW_ALTER_TABLE = new RegExp(String.raw`\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(${QNAME})([^;]*)`, 'gi')
const ADDS_COLUMN = /(?:^|,)\s*ADD\s+(?!\s|CONSTRAINT\b|CHECK\b|UNIQUE\b|PRIMARY\b|EXCLUDE\b|FOREIGN\b)/i
const RAW_ADD_VALUE = new RegExp(String.raw`\bALTER\s+TYPE\s+(${QNAME})\s+ADD\s+VALUE\b`, 'gi')
const RAW_BACKFILL = new RegExp(String.raw`\b(?:UPDATE\s+(?:ONLY\s+)?|INSERT\s+INTO\s+)(${QNAME})`, 'gi')

type Found = { widened: Set<string>; enums: Set<string>; backfilled: Set<string> }

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

// Backfills live in exported helpers so their own tests can call them, so calls are followed.
// Nested bodies are walked too, because callbacks such as rows.map(async (r) => ...) run.
function reach(functions: Map<string, ts.Node>, start: string) {
    const reached = new Set<string>()
    const queue = [start]
    while (queue.length) {
        const name = queue.pop()!
        const body = functions.get(name)
        if (!body || reached.has(name)) continue
        reached.add(name)
        const visit = (node: ts.Node) => {
            if (ts.isCallExpression(node)) {
                for (const target of [node.expression, ...node.arguments]) {
                    if (ts.isIdentifier(target) && target.text !== 'down') queue.push(target.text)
                }
            }
            ts.forEachChild(node, visit)
        }
        visit(body)
    }
    return reached
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

function alteredTable(addColumn: ts.CallExpression) {
    let node: ts.Expression = addColumn.expression
    while (ts.isPropertyAccessExpression(node) || ts.isCallExpression(node)) {
        if (ts.isCallExpression(node) && calleeName(node) === 'alterTable') return literalArg(node)
        node = node.expression
    }
}

function collectCall(call: ts.CallExpression, found: Found) {
    const name = calleeName(call)
    const table = name === 'addColumn' ? alteredTable(call) : literalArg(call)
    if (!table) return
    if (name === 'addColumn' || name === 'createTable') found.widened.add(builderTable(table))
    if (name === 'updateTable' || name === 'insertInto') found.backfilled.add(builderTable(table))
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

function collectSql(text: string, found: Found) {
    const clean = text.replace(SQL_STRINGS_AND_COMMENTS, ' ')
    for (const [, table, actions] of clean.matchAll(RAW_ALTER_TABLE)) {
        if (ADDS_COLUMN.test(actions)) found.widened.add(sqlName(table))
    }
    for (const [, type] of clean.matchAll(RAW_ADD_VALUE)) found.enums.add(sqlName(type))
    for (const [, table] of clean.matchAll(RAW_BACKFILL)) found.backfilled.add(sqlName(table))
}

function collect(roots: ts.Node[], skip = new Set<ts.Node>()) {
    const found: Found = { widened: new Set(), enums: new Set(), backfilled: new Set() }
    const visit = (node: ts.Node) => {
        if (skip.has(node)) return
        if (ts.isCallExpression(node)) collectCall(node, found)
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

    const bodies = (names: string[]) => names.map((name) => functions.get(name)!)
    const upReach = reach(functions, 'up')
    const downOnly = [...reach(functions, 'down')].filter((name) => !upReach.has(name))
    // Widenings are read more broadly than backfills, so a miss asks for a backfill instead of passing.
    const { widened, enums } = collect([sourceFile], new Set(bodies(downOnly)))
    const { backfilled } = collect(bodies([...upReach]))

    const tables = [...widened].filter((table) => STUDY_TABLE.test(table) && !backfilled.has(table))
    // A new enum value cannot be written before the migration's transaction commits, so no backfill covers it.
    const studyEnums = [...enums].filter((type) => STUDY_ENUM.test(type))
    return [...new Set([...tables, ...studyEnums])].sort()
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

    it('reports a file without up()', () => {
        expect(missingBackfills('export async function down(db) {}')).toEqual(['no up() function'])
    })
})
