import { describe, expect, it } from '@/tests/unit.helpers'
import { ABILITY_CHECK_EXCEPTIONS, analyzeSource, findStaleExceptions } from './action-file-rules'

const ACTIONS_PATH = 'src/server/actions/foo.actions.ts'

const serverModule = (body: string) => `'use server'\nimport { Action } from './action'\n${body}`

const guarded = `export const fooAction = new Action('fooAction').params(s).requireAbilityTo('view', 'Study').handler(h)`
const unguarded = `export const fooAction = new Action('fooAction').params(s).handler(h)`

const errorsFor = (filePath: string, content: string) => analyzeSource(filePath, content).errors

describe('analyzeSource', () => {
    it('rejects a server action module outside src/server/actions', () => {
        expect(errorsFor('src/app/x/foo.actions.ts', serverModule(guarded))).toEqual([
            'server action modules belong in src/server/actions',
        ])
    })

    it('requires requireAbilityTo in the chain', () => {
        expect(errorsFor(ACTIONS_PATH, serverModule(unguarded))).toEqual([
            expect.stringContaining('fooAction has no requireAbilityTo'),
        ])
        expect(analyzeSource(ACTIONS_PATH, serverModule(guarded))).toEqual({
            errors: [],
            actions: [{ name: 'fooAction', guarded: true }],
        })
    })

    it('accepts an unguarded action only at the path and name of an exception', () => {
        const [key] = Object.keys(ABILITY_CHECK_EXCEPTIONS)
        const [filePath, name] = key.split('#')
        const source = serverModule(`export const ${name} = new Action('${name}').handler(h)`)

        expect(errorsFor(filePath, source)).toEqual([])
        expect(errorsFor('src/server/actions/other.actions.ts', source)).toEqual([
            expect.stringContaining(`${name} has no requireAbilityTo`),
        ])
    })

    it.each([
        ['a local export list', `const fooAction = new Action('fooAction').handler(h)\nexport { fooAction }`],
        ['a renamed export', `const foo = new Action('fooAction').handler(h)\nexport { foo as fooAction }`],
        ['a re-export', `export { fooAction } from './x'`],
        ['a star re-export', `export * from './x'`],
        ['a default export', `export default fooAction`],
        ['an exported function', `export async function fooAction() {}`],
        ['an exported let', `export let fooAction = new Action('fooAction').handler(h)`],
        ['an exported class', `export class FooAction {}`],
    ])('rejects %s', (_, body) => {
        expect(errorsFor(ACTIONS_PATH, serverModule(body))).toContain(
            `unsupported export form; export actions as const xAction = new Action('xAction')...handler(...)`,
        )
    })

    it('accepts type-only exports', () => {
        const source = serverModule(
            `export type X = string\nexport interface Y { a: 1 }\ntype Z = number\nexport { type Z }\n${guarded}`,
        )
        expect(errorsFor(ACTIONS_PATH, source)).toEqual([])
    })

    it('rejects a chain that does not end in handler', () => {
        const source = serverModule(
            `export const fooAction = new Action('fooAction').requireAbilityTo('view', 'Study')`,
        )
        expect(errorsFor(ACTIONS_PATH, source)).toEqual([expect.stringContaining('fooAction must be exported as')])
    })

    it('rejects a name mismatch', () => {
        const source = serverModule(
            `export const fooAction = new Action('barAction').requireAbilityTo('view', 'Study').handler(h)`,
        )
        expect(errorsFor(ACTIONS_PATH, source)).toEqual([
            "action name in constructor ('barAction') does not match variable name ('fooAction')",
        ])
    })

    it('does not treat use server in a comment or after an import as a directive', () => {
        expect(analyzeSource('src/app/x.ts', `// 'use server'\nexport const foo = 1`).errors).toEqual([])
        expect(analyzeSource('src/app/x.ts', `import a from 'a'\n'use server'\nexport const foo = a`).errors).toEqual(
            [],
        )
    })

    it('applies the module rules to a page with a module-level directive', () => {
        const source = `'use server'\nexport async function saveAction() {}`
        expect(errorsFor('src/app/x/page.tsx', source)).toEqual([
            'server action modules belong in src/server/actions',
            expect.stringContaining('unsupported export form'),
        ])
    })

    it.each([
        ['an exported function', 'src/server/foo.ts', `export async function fooAction() { 'use server'; return 1 }`],
        [
            'an inline action in a page',
            'src/app/x/page.tsx',
            `export default function Page() {\n  async function save() { 'use server' }\n  return <form action={save} />\n}`,
        ],
        ['an arrow function', 'src/server/foo.ts', `const f = async () => { 'use server' }`],
    ])('rejects a function-level directive in %s', (_, filePath, source) => {
        expect(errorsFor(filePath, source)).toEqual([expect.stringContaining("function-level 'use server'")])
    })

    it('ignores use server after another statement in a function body', () => {
        expect(errorsFor('src/server/foo.ts', `async function f() { const a = 1; 'use server' }`)).toEqual([])
    })
})

describe('analyzeSource file names in src/server/actions', () => {
    it('rejects a use server module without the .actions.ts suffix', () => {
        expect(errorsFor('src/server/actions/foo.ts', serverModule(guarded))).toEqual([
            'server action modules must be named *.actions.ts',
        ])
    })

    // No 'use server' text at all: the rule must run before the module-directive early return.
    it('rejects an .actions.ts module without the directive', () => {
        expect(errorsFor(ACTIONS_PATH, `import { Action } from './action'\n${guarded}`)).toEqual([
            "*.actions.ts modules must start with a 'use server' directive",
        ])
    })

    it('accepts a test file and a helper module without the directive', () => {
        expect(errorsFor('src/server/actions/foo.actions.test.ts', `import { it } from 'vitest'`)).toEqual([])
        expect(errorsFor('src/server/actions/study-subject.ts', `export const withStudySubject = 1`)).toEqual([])
    })
})

describe('findStaleExceptions', () => {
    const [key, ...otherKeys] = Object.keys(ABILITY_CHECK_EXCEPTIONS)
    const others = otherKeys.map((k) => ({ key: k, guarded: false }))

    it('reports an entry with no matching action', () => {
        expect(findStaleExceptions(others)).toEqual([key])
    })

    it('reports an entry whose action is guarded', () => {
        expect(findStaleExceptions([...others, { key, guarded: true }])).toEqual([key])
    })

    it('accepts an entry whose action is unguarded', () => {
        expect(findStaleExceptions([...others, { key, guarded: false }])).toEqual([])
    })
})
