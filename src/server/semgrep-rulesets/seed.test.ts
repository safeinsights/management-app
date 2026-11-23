import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { SendMessageCommand } from '@aws-sdk/client-sqs'
import { onTestFinished } from 'vitest'
import { describe, expect, it } from '@/tests/unit.helpers'
import { stubJobQueue } from '@/tests/job-queue.helpers'
import { stubRulesBucket } from '@/tests/semgrep-rules-s3.helpers'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { planSeed, readSeedFiles, requestSeedPublish, SEED_AUTHOR, seedEnvironments, seedRuleset } from './seed'
import { semgrepRulesetChangePayloadSchema } from './change'

// Lays out files as { 'rules/secrets.yaml': 'text' } under a temporary folder.
function tree(files: Record<string, string | Buffer>) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'semgrep-seed-'))
    onTestFinished(() => fs.rmSync(root, { recursive: true, force: true }))
    for (const [file, content] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
        fs.writeFileSync(path.join(root, file), content)
    }
    return (...segments: string[]) => path.join(root, ...segments)
}

const iac = () =>
    tree({
        'rules/secrets.yaml': 'rules: [secrets]',
        'rules/privacy-r.yaml': 'rules: [privacy]',
        'rules/README.md': 'not a rule',
        'tests/secrets.r': 'token <- "x"',
        'tests/privacy-r.r': 'print(df)',
        'tests/check-coverage.ts': 'iac tooling',
        'notebooks/01-intro.ipynb': '{"cells": []}',
        'notebooks/data/load.R': 'read.csv(f)',
        'notebooks/.ipynb_checkpoints/01-intro.ipynb': '{}',
        'notebooks/.git/config': '[core]',
    })

const source = (at: ReturnType<typeof tree>) => ({
    rulesDir: at('rules'),
    testsDir: at('tests'),
    corpusDirs: [at('notebooks')],
})

const files = [
    { path: 'rules/secrets.yaml', content: 'rules: []' },
    { path: 'tests/secrets.r', content: 'token <- "x"' },
]

describe('readSeedFiles', () => {
    it('takes each rule file, its fixture and the corpus, and leaves tooling and dot entries', () => {
        expect(readSeedFiles(source(iac()))).toEqual([
            { path: 'rules/privacy-r.yaml', content: 'rules: [privacy]' },
            { path: 'rules/secrets.yaml', content: 'rules: [secrets]' },
            { path: 'tests/privacy-r.r', content: 'print(df)' },
            { path: 'tests/secrets.r', content: 'token <- "x"' },
            { path: 'tests/corpus/notebooks/01-intro.ipynb', content: '{"cells": []}' },
            { path: 'tests/corpus/notebooks/data/load.R', content: 'read.csv(f)' },
        ])
    })

    it('stops when a rule file has no fixture, which no gate would pass', () => {
        const at = iac()
        fs.rmSync(at('tests', 'privacy-r.r'))
        expect(() => readSeedFiles(source(at))).toThrow(/no fixture in .* for privacy-r\.yaml/)
    })

    it('stops on a file that is not UTF-8 text', () => {
        const at = iac()
        fs.writeFileSync(at('notebooks', 'plot.png'), Buffer.from([0x89, 0x50, 0xff, 0xfe]))
        expect(() => readSeedFiles(source(at))).toThrow(/plot\.png is not UTF-8 text/)
    })
})

describe('planSeed', () => {
    it('creates a version in an empty environment', async () => {
        stubRulesBucket()
        expect(await planSeed('staging', files)).toEqual({ env: 'staging', action: 'create' })
    })

    it('leaves an environment with a published version alone', async () => {
        const bucket = stubRulesBucket()
        bucket.put(
            'rulesets/dev/published.json',
            JSON.stringify({
                schemaVersion: 1,
                version: 'v4',
                publishedAt: '2026-11-20T10:00:00.000Z',
                publishedBy: { userId: null, name: 'Ada Admin' },
                kind: 'publish',
                previousVersion: 'v3',
                requestId: '0195f1a4-6b52-7a3c-9e21-3f4d5c6b7a80',
            }),
        )
        expect(await planSeed('dev', files)).toEqual({
            env: 'dev',
            action: 'skip',
            reason: 'published',
            version: 'v4',
        })
    })

    it('leaves an environment alone once its latest version holds the seed files, in any order', async () => {
        stubRulesBucket()
        await seedRuleset('dev', files)
        expect(await planSeed('dev', files.toReversed())).toEqual({
            env: 'dev',
            action: 'skip',
            reason: 'uploaded',
            version: 'v1',
        })
    })

    it.each([
        ['changed content', [files[0], { ...files[1], content: 'token <- "fixed"' }]],
        ['one file more', [...files, { path: 'tests/corpus/notebooks/load.R', content: 'read.csv(f)' }]],
        ['one file fewer', [files[0]]],
    ])('creates the next version when the complete latest version holds other files: %s', async (_, seed) => {
        stubRulesBucket()
        await seedRuleset('dev', files)

        expect(await planSeed('dev', seed)).toEqual({ env: 'dev', action: 'create' })
        expect(await seedRuleset('dev', seed)).toBe('v2')
    })

    it('creates the next version after an upload that stopped half way', async () => {
        const bucket = stubRulesBucket()
        await seedRuleset('dev', files)
        bucket.objects.delete('rulesets/dev/v1/tests/secrets.r')

        expect(await planSeed('dev', files)).toEqual({ env: 'dev', action: 'create' })
        expect(await seedRuleset('dev', files)).toBe('v2')
    })
})

describe('seedRuleset', () => {
    it('writes the version as the seed author and never the published pointer', async () => {
        const bucket = stubRulesBucket()
        expect(await seedRuleset('production', files)).toBe('v1')

        expect(bucket.keys()).toEqual([
            'rulesets/production/v1/rules/secrets.yaml',
            'rulesets/production/v1/tests/secrets.r',
            'rulesets/production/v1/version.json',
        ])
        expect(bucket.readJson('rulesets/production/v1/version.json')).toMatchObject({
            env: 'production',
            author: SEED_AUTHOR,
            source: null,
            files: files.map((file) => file.path),
        })
    })
})

describe('seedEnvironments', () => {
    it('writes nothing on a dry run', async () => {
        const bucket = stubRulesBucket()
        const results = await seedEnvironments(files, false)

        expect(results.map((result) => result.action)).toEqual(['create', 'create', 'create', 'create', 'create'])
        expect(bucket.keys()).toEqual([])
    })

    it('gives every environment v1 once, and a second run writes nothing', async () => {
        const bucket = stubRulesBucket()
        const first = await seedEnvironments(files, true)
        expect(first).toEqual(
            ['dev', 'sandbox', 'staging', 'demo', 'production'].map((env) => ({
                env,
                action: 'created',
                version: 'v1',
            })),
        )
        const writes = bucket.s3.commandCalls(PutObjectCommand).length

        const second = await seedEnvironments(files, true)
        expect(second.map((result) => result.action)).toEqual(['skip', 'skip', 'skip', 'skip', 'skip'])
        expect(bucket.s3.commandCalls(PutObjectCommand)).toHaveLength(writes)
        expect(bucket.keys().filter((key) => key.endsWith('published.json'))).toEqual([])
    })
})

describe('requestSeedPublish', () => {
    it('queues a publish the change job accepts, requested by the seed', async () => {
        const sqs = stubJobQueue()

        const requestId = await requestSeedPublish('v1')

        const input = sqs.commandCalls(SendMessageCommand)[0].args[0].input
        expect(input.QueueUrl).toBe('https://sqs.test/jobs')
        const message = JSON.parse(input.MessageBody!)
        expect(message.job).toBe('semgrep-ruleset-change')
        expect(semgrepRulesetChangePayloadSchema.parse(message.payload)).toMatchObject({
            kind: 'publish',
            version: 'v1',
            requestId,
            requestedBy: SEED_AUTHOR,
        })
    })
})
