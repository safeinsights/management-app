import { env } from '@/server/config'
import { RULESET_ENVS, type RulesetEnv } from '../../../services/semgrep-runner/protocol'

export class RulesetStoreNotConfigured extends Error {
    name = 'RulesetStoreNotConfigured'
}

export type SemgrepRulesetConfig = {
    bucket: string
    // Sent as ExpectedBucketOwner on every call; unset only against a local S3 stand-in.
    owner: string | undefined
    env: RulesetEnv
    upstreamEnv: RulesetEnv | null
    runnerFunctionName: string | null
}

const asRulesetEnv = (value: string | undefined) => RULESET_ENVS.find((name) => name === value)

// Mirrors the runner: real AWS always gets the bucket owner check.
const isLocalEndpoint = (endpoint: string | undefined) =>
    Boolean(endpoint) && !new URL(endpoint!).hostname.endsWith('.amazonaws.com')

export function semgrepRulesetConfig(): SemgrepRulesetConfig {
    const bucket = env.SEMGREP_RULES_BUCKET
    const rulesetEnv = asRulesetEnv(env.SEMGREP_RULESET_ENV)
    const owner = env.SEMGREP_RULES_BUCKET_OWNER || undefined
    const upstreamEnv = asRulesetEnv(env.SEMGREP_RULESET_UPSTREAM_ENV) ?? null
    if (!bucket || !rulesetEnv) throw new RulesetStoreNotConfigured('the Semgrep rules bucket is not configured')
    if (owner ? !/^\d{12}$/.test(owner) : !isLocalEndpoint(env.S3_ENDPOINT)) {
        throw new RulesetStoreNotConfigured('SEMGREP_RULES_BUCKET_OWNER must be an AWS account id')
    }
    if (env.SEMGREP_RULESET_UPSTREAM_ENV && !upstreamEnv) {
        throw new RulesetStoreNotConfigured('SEMGREP_RULESET_UPSTREAM_ENV is not a ruleset environment')
    }
    return { bucket, owner, env: rulesetEnv, upstreamEnv, runnerFunctionName: env.SEMGREP_RUNNER_FUNCTION_NAME || null }
}
