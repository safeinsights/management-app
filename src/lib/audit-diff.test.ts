import { describe, expect, it } from 'vitest'
import { codeEnvAuditMetadataSchema, diffFields } from './audit-diff'

// Mirrors the shape of the audited orgCodeEnv columns. Declared explicitly so the
// generic infers the full key set rather than narrowing to whichever keys a given
// fixture happens to set.
type Row = {
    name: string
    url: string
    settings: { environment: { name: string; value: string }[] }
    commandLines: Record<string, string>
    starterCodeFileNames: string[]
    sampleDataPath: string | null
}

const FIELDS = ['name', 'url', 'settings', 'commandLines', 'starterCodeFileNames', 'sampleDataPath'] as const

describe('diffFields', () => {
    it('omits fields that did not change', () => {
        const row = { name: 'env', url: 'repo/img:v1' }
        expect(diffFields<Row>(row, row, FIELDS)).toEqual([])
    })

    it('reports primitive changes with before and after', () => {
        const changes = diffFields<Row>({ url: 'repo/img:v1' }, { url: 'repo/img:v2' }, FIELDS)
        expect(changes).toEqual([{ field: 'url', before: 'repo/img:v1', after: 'repo/img:v2' }])
    })

    it('treats undefined and null as equal', () => {
        expect(diffFields<Row>({ sampleDataPath: undefined }, { sampleDataPath: null }, FIELDS)).toEqual([])
    })

    it('does not report jsonb objects that are deeply equal but not identical', () => {
        const before = { settings: { environment: [{ name: 'KEY', value: 'a' }] } }
        const after = { settings: { environment: [{ name: 'KEY', value: 'a' }] } }
        expect(diffFields<Row>(before, after, FIELDS)).toEqual([])
    })

    it('detects a changed value inside settings.environment', () => {
        const before = { settings: { environment: [{ name: 'KEY', value: 'a' }] } }
        const after = { settings: { environment: [{ name: 'KEY', value: 'b' }] } }
        expect(diffFields<Row>(before, after, FIELDS)).toEqual([
            { field: 'settings', before: before.settings, after: after.settings },
        ])
    })

    // Postgres reorders jsonb object keys on storage, so a stringify-based comparison
    // would report a change here on every save.
    it('ignores key order differences in commandLines', () => {
        const before = { commandLines: { r: 'Rscript main.r', py: 'python main.py' } }
        const after = { commandLines: { py: 'python main.py', r: 'Rscript main.r' } }
        expect(diffFields<Row>(before, after, FIELDS)).toEqual([])
    })

    it('detects reordering of starterCodeFileNames', () => {
        const before = { starterCodeFileNames: ['main.r', 'helpers.r'] }
        const after = { starterCodeFileNames: ['helpers.r', 'main.r'] }
        expect(diffFields<Row>(before, after, FIELDS)).toHaveLength(1)
    })

    it('returns changes in the order given by fields', () => {
        const before = { url: 'a', name: 'x', sampleDataPath: 'p1' }
        const after = { url: 'b', name: 'y', sampleDataPath: 'p2' }
        expect(diffFields<Row>(before, after, FIELDS).map((c) => c.field)).toEqual(['name', 'url', 'sampleDataPath'])
    })

    it('reports every field as created when before is empty', () => {
        const changes = diffFields<Row>({}, { name: 'env', url: 'repo/img:v1' }, FIELDS)
        expect(changes).toEqual([
            { field: 'name', before: null, after: 'env' },
            { field: 'url', before: null, after: 'repo/img:v1' },
        ])
    })

    it('reports every field as removed when after is empty', () => {
        const changes = diffFields<Row>({ name: 'env' }, {}, FIELDS)
        expect(changes).toEqual([{ field: 'name', before: 'env', after: null }])
    })
})

describe('codeEnvAuditMetadataSchema', () => {
    it('parses metadata with changes and flags', () => {
        const parsed = codeEnvAuditMetadataSchema.parse({
            changes: [{ field: 'url', before: 'a', after: 'b' }],
            starterCodeReplaced: true,
            name: 'env',
        })
        expect(parsed.changes).toHaveLength(1)
        expect(parsed.starterCodeReplaced).toBe(true)
    })

    it('defaults changes to an empty array', () => {
        expect(codeEnvAuditMetadataSchema.parse({}).changes).toEqual([])
    })

    it('accepts nested json values for before and after', () => {
        const parsed = codeEnvAuditMetadataSchema.parse({
            changes: [{ field: 'settings', before: null, after: { environment: [{ name: 'K', value: 'v' }] } }],
        })
        expect(parsed.changes[0].after).toEqual({ environment: [{ name: 'K', value: 'v' }] })
    })
})
