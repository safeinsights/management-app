import { spawnSync } from 'node:child_process'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from '../../tests/unit.helpers'
import { parseRunnerConfig } from './handler.ts'
import { RULESET_ENVS } from './protocol.ts'

// Vitest drops a type-only import that lacks `import type`; Node's type stripping does not, and Lambda
// loads the handler with plain Node. Only a real Node process shows that the image will start.
it('loads the Lambda entry point in plain Node', () => {
    const entry = path.join(path.dirname(fileURLToPath(import.meta.url)), 'index.mjs')
    const script = `const m = await import(${JSON.stringify(entry)}); process.exit(typeof m.handler === 'function' ? 0 : 1)`
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf-8' })

    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' })
})

describe('parseRunnerConfig', () => {
    const env = {
        SEMGREP_RULES_BUCKET: 'si-semgrep-rules',
        SEMGREP_RULESET_ENV: 'dev',
        SEMGREP_RULES_BUCKET_OWNER: '432772479668',
    }

    it.each(RULESET_ENVS)('accepts the ruleset environment %s', (rulesetEnv) => {
        expect(parseRunnerConfig({ ...env, SEMGREP_RULESET_ENV: rulesetEnv })).toEqual({
            rulesBucket: 'si-semgrep-rules',
            rulesetEnv,
            rulesBucketOwner: '432772479668',
            s3Endpoint: undefined,
        })
    })

    it('rejects an unknown ruleset environment and a missing bucket', () => {
        expect(() => parseRunnerConfig({ ...env, SEMGREP_RULESET_ENV: 'Production' })).toThrow()
        expect(() => parseRunnerConfig({ ...env, SEMGREP_RULES_BUCKET: '' })).toThrow()
    })

    // Without the owner check, a bucket recreated under the same global name could feed the runner rules.
    it('requires a valid bucket owner against real S3', () => {
        expect(() => parseRunnerConfig({ ...env, SEMGREP_RULES_BUCKET_OWNER: undefined })).toThrow(
            /SEMGREP_RULES_BUCKET_OWNER/,
        )
        expect(() => parseRunnerConfig({ ...env, SEMGREP_RULES_BUCKET_OWNER: '4327' })).toThrow()
    })

    it('skips the owner check against a local S3 endpoint', () => {
        expect(
            parseRunnerConfig({ ...env, SEMGREP_RULES_BUCKET_OWNER: undefined, S3_ENDPOINT: 'http://seaweedfs:8333' }),
        ).toMatchObject({ rulesBucketOwner: undefined, s3Endpoint: 'http://seaweedfs:8333' })
    })
})
