import { describe, expect, it } from '@/tests/unit.helpers'
import { passingGate } from '@/tests/semgrep-rules-s3.helpers'
import { rulesetDraftFilesSchema, rulesetPointerSchema, rulesetRequestSchema, rulesetVersionNumber } from './schemas'

const person = { userId: '0195f1a4-6b52-7a3c-9e21-3f4d5c6b7a80', name: 'Ada Admin' }

describe('rulesetPointerSchema', () => {
    const pointer = {
        schemaVersion: 1,
        version: 'v4',
        publishedAt: '2026-11-20T10:00:00.000Z',
        publishedBy: person,
        kind: 'rollback',
        previousVersion: 'v5',
        requestId: '0195f1a4-6b52-7a3c-9e21-3f4d5c6b7a81',
    }

    it('accepts a pointer, also for the first publish by a non-user', () => {
        expect(rulesetPointerSchema.safeParse(pointer).success).toBe(true)
        expect(
            rulesetPointerSchema.safeParse({
                ...pointer,
                previousVersion: null,
                publishedBy: { userId: null, name: 'seed' },
            }).success,
        ).toBe(true)
    })

    it('rejects an unknown kind and a version that is not v<N>', () => {
        expect(rulesetPointerSchema.safeParse({ ...pointer, kind: 'delete' }).success).toBe(false)
        expect(rulesetPointerSchema.safeParse({ ...pointer, version: 'latest' }).success).toBe(false)
    })
})

describe('rulesetDraftFilesSchema', () => {
    const rule = { path: 'rules/secrets.yaml', content: 'rules: []' }

    it('accepts rule files with fixtures and corpus files', () => {
        const files = [
            rule,
            { path: 'tests/secrets.r', content: '' },
            { path: 'tests/corpus/a/analysis.R', content: 'x' },
        ]
        expect(rulesetDraftFilesSchema.safeParse(files).success).toBe(true)
    })

    it('rejects no files, no rule file, a duplicate, a path outside rules/ and tests/, and a non-rule under rules/', () => {
        const fixture = { path: 'tests/secrets.r', content: '' }
        for (const files of [
            [],
            [fixture],
            [rule, rule],
            [rule, { path: 'version.json', content: '{}' }],
            [rule, { path: 'rules/README.md', content: '' }],
        ]) {
            expect(rulesetDraftFilesSchema.safeParse(files).success).toBe(false)
        }
    })
})

describe('rulesetRequestSchema', () => {
    it('accepts a finished request with its gate response and a running one without', () => {
        const request = {
            requestId: '0195f1a4-6b52-7a3c-9e21-3f4d5c6b7a81',
            kind: 'promote',
            targetVersion: 'v2',
            upstreamVersion: 'v9',
            requestedBy: person,
            requestedAt: '2026-11-20T10:00:00.000Z',
            startedAt: '2026-11-20T10:00:01.000Z',
            finishedAt: '2026-11-20T10:00:30.000Z',
            status: 'published',
            reason: null,
            gate: passingGate('v2'),
        }
        expect(rulesetRequestSchema.safeParse(request).success).toBe(true)
        expect(
            rulesetRequestSchema.safeParse({
                ...request,
                targetVersion: null,
                finishedAt: null,
                status: 'running',
                gate: null,
            }).success,
        ).toBe(true)
        expect(rulesetRequestSchema.safeParse({ ...request, status: 'done' }).success).toBe(false)
    })
})

describe('rulesetVersionNumber', () => {
    it('reads the number of a version id', () => {
        expect(rulesetVersionNumber('v12')).toBe(12)
    })
})
