import { PutObjectCommand } from '@aws-sdk/client-s3'
import { describe, expect, it } from '@/tests/unit.helpers'
import { stubRulesBucket } from '@/tests/semgrep-rules-s3.helpers'
import type { RulesetManifest } from '../../../services/semgrep-runner/protocol'
import { createVersion, listVersionNumbers, readManifest, readPublished, readVersionFiles, writePointer } from './store'

const author = { userId: '0195f1a4-6b52-7a3c-9e21-3f4d5c6b7a80', name: 'Ada Admin' }
const files = [
    { path: 'rules/secrets.yaml', content: 'rules: []' },
    { path: 'tests/secrets.r', content: 'token <- "x"' },
    { path: 'tests/corpus/analysis.R', content: 'mean(x)' },
]
const draft = { env: 'dev' as const, files, changeNote: 'first rules', author, source: null }

describe('createVersion', () => {
    it('writes version.json first, then every file, all create-only', async () => {
        const bucket = stubRulesBucket()
        const manifest = await createVersion(draft)

        const puts = bucket.s3.commandCalls(PutObjectCommand).map((call) => call.args[0].input)
        expect(puts.map((input) => input.Key)).toEqual([
            'rulesets/dev/v1/version.json',
            'rulesets/dev/v1/rules/secrets.yaml',
            'rulesets/dev/v1/tests/secrets.r',
            'rulesets/dev/v1/tests/corpus/analysis.R',
        ])
        for (const input of puts) expect(input.IfNoneMatch).toBe('*')
        expect(bucket.read('rulesets/dev/v1/tests/secrets.r')).toBe('token <- "x"')
        expect(bucket.readJson('rulesets/dev/v1/version.json')).toEqual(manifest)
        expect(manifest).toEqual({
            schemaVersion: 1,
            version: 'v1',
            env: 'dev',
            createdAt: expect.any(String),
            author,
            changeNote: 'first rules',
            source: null,
            files: files.map((file) => file.path),
        })
    })

    it('numbers a version max+1 and keeps the source of a promotion', async () => {
        const bucket = stubRulesBucket({ env: 'staging' })
        bucket.put('rulesets/staging/v2/version.json', '{}')
        bucket.put('rulesets/staging/v9/version.json', '{}')
        bucket.put('rulesets/staging/requests/x.json', '{}')

        const manifest = await createVersion({ ...draft, env: 'staging', source: { env: 'dev', version: 'v4' } })
        expect(manifest).toMatchObject({ version: 'v10', source: { env: 'dev', version: 'v4' } })
    })

    it('takes the next number when another writer claimed it first', async () => {
        const bucket = stubRulesBucket()
        let raced = false
        bucket.s3.on(PutObjectCommand).callsFake(({ Key, IfNoneMatch }) => {
            if (!raced && Key === 'rulesets/dev/v1/version.json') {
                raced = true
                bucket.put(Key, '{}')
            }
            const exists = bucket.read(Key) !== undefined
            if (IfNoneMatch === '*' && exists) {
                throw Object.assign(new Error('PreconditionFailed'), { $metadata: { httpStatusCode: 412 } })
            }
            return { ETag: bucket.put(Key, '') }
        })

        expect((await createVersion(draft)).version).toBe('v2')
    })

    it('refuses files that are not a ruleset before writing anything', async () => {
        const bucket = stubRulesBucket()
        await expect(createVersion({ ...draft, files: [{ path: 'tests/a.r', content: '' }] })).rejects.toThrow()
        await expect(
            createVersion({ ...draft, files: [...files, { path: 'notes.txt', content: '' }] }),
        ).rejects.toThrow()
        expect(bucket.keys()).toEqual([])
    })
})

describe('reading the store', () => {
    it('returns null without a pointer or a manifest', async () => {
        stubRulesBucket()
        expect(await readPublished('dev')).toBeNull()
        expect(await readManifest('dev', 'v1')).toBeNull()
        expect(await listVersionNumbers('dev')).toEqual([])
    })

    it('reads back the pointer with its ETag, the manifest and the files', async () => {
        stubRulesBucket()
        const manifest: RulesetManifest = await createVersion(draft)
        const pointer = {
            schemaVersion: 1 as const,
            version: 'v1',
            publishedAt: new Date().toISOString(),
            publishedBy: author,
            kind: 'publish' as const,
            previousVersion: null,
            requestId: '0195f1a4-6b52-7a3c-9e21-3f4d5c6b7a81',
        }
        const etag = await writePointer('dev', pointer, null)

        expect(await readPublished('dev')).toEqual({ pointer, etag })
        expect(await readManifest('dev', 'v1')).toEqual(manifest)
        expect(await readVersionFiles('dev', manifest)).toEqual(files)
        expect(await listVersionNumbers('dev')).toEqual([1])
    })
})
