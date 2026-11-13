import { describe, expect, it } from '../../tests/unit.helpers'
import { parseRunnerConfig } from './config.ts'
import { RULESET_ENVS } from './protocol.ts'

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
            forcePathStyle: false,
        })
    })

    it('forces path style only for a non-AWS endpoint', () => {
        const local = parseRunnerConfig({ ...env, S3_ENDPOINT: 'http://seaweedfs:8333' })
        const fips = parseRunnerConfig({ ...env, S3_ENDPOINT: 'https://s3-fips.us-east-1.amazonaws.com' })
        expect([local.forcePathStyle, fips.forcePathStyle]).toEqual([true, false])
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

    it('keeps the owner check when an endpoint is set as well', () => {
        expect(parseRunnerConfig({ ...env, S3_ENDPOINT: 'https://s3-fips.us-east-1.amazonaws.com' })).toMatchObject({
            rulesBucketOwner: '432772479668',
        })
    })
})
