import { describe, expect, it, vi } from '@/tests/unit.helpers'
import { RULES_BUCKET, RULES_BUCKET_OWNER, RUNNER_FUNCTION, stubRulesetEnv } from '@/tests/semgrep-rules-s3.helpers'
import { RulesetStoreNotConfigured, semgrepRulesetConfig } from './config'

describe('semgrepRulesetConfig', () => {
    it('reads the bucket, owner, environment, upstream and runner', () => {
        stubRulesetEnv({ env: 'staging', upstreamEnv: 'dev' })
        expect(semgrepRulesetConfig()).toEqual({
            bucket: RULES_BUCKET,
            owner: RULES_BUCKET_OWNER,
            env: 'staging',
            upstreamEnv: 'dev',
            runnerFunctionName: RUNNER_FUNCTION,
        })
    })

    it('has no upstream and no runner when they are unset', () => {
        stubRulesetEnv({ env: 'dev', runner: false })
        expect(semgrepRulesetConfig()).toMatchObject({ upstreamEnv: null, runnerFunctionName: null })
    })

    it('is not configured without a bucket or with an unknown environment', () => {
        stubRulesetEnv({ env: 'dev' })
        vi.stubEnv('SEMGREP_RULESET_ENV', 'qa')
        expect(() => semgrepRulesetConfig()).toThrow(RulesetStoreNotConfigured)
        vi.stubEnv('SEMGREP_RULESET_ENV', 'dev')
        vi.stubEnv('SEMGREP_RULES_BUCKET', '')
        expect(() => semgrepRulesetConfig()).toThrow(RulesetStoreNotConfigured)
    })

    it('requires the bucket owner against AWS S3, but not against a local stand-in', () => {
        stubRulesetEnv({ env: 'dev' })
        vi.stubEnv('SEMGREP_RULES_BUCKET_OWNER', '')
        vi.stubEnv('S3_ENDPOINT', 'http://seaweedfs:8333')
        expect(semgrepRulesetConfig().owner).toBeUndefined()
        vi.stubEnv('S3_ENDPOINT', '')
        expect(() => semgrepRulesetConfig()).toThrow(RulesetStoreNotConfigured)
        vi.stubEnv('SEMGREP_RULES_BUCKET_OWNER', 'not-an-account')
        expect(() => semgrepRulesetConfig()).toThrow(RulesetStoreNotConfigured)
    })
})
