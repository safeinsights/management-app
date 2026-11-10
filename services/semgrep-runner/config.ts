import type { S3Client } from '@aws-sdk/client-s3'
import { z } from 'zod'
import { RULESET_ENVS, type RulesetEnv } from './protocol.ts'

// The runner is its own Lambda image and does not load the app's src/server/config.ts. This module is
// its one reader of process.env: its settings, and the environment its Semgrep processes inherit.
export const processEnv = (): NodeJS.ProcessEnv => process.env

const configSchema = z
    .object({
        SEMGREP_RULES_BUCKET: z.string().min(1),
        SEMGREP_RULESET_ENV: z.enum(RULESET_ENVS),
        SEMGREP_RULES_BUCKET_OWNER: z
            .string()
            .regex(/^\d{12}$/)
            .optional(),
        S3_ENDPOINT: z.url().optional(),
    })
    // A local S3 stand-in has no account owner; real AWS always gets the owner check.
    .refine((env) => env.S3_ENDPOINT || env.SEMGREP_RULES_BUCKET_OWNER, {
        message: 'SEMGREP_RULES_BUCKET_OWNER is required without S3_ENDPOINT',
        path: ['SEMGREP_RULES_BUCKET_OWNER'],
    })

export type RulesetStorage = {
    s3: S3Client
    rulesBucket: string
    rulesetEnv: RulesetEnv
    // Sent as ExpectedBucketOwner on every rules bucket call; unset only against a local S3 stand-in.
    rulesBucketOwner?: string
}

export type RunnerConfig = Omit<RulesetStorage, 's3'> & { s3Endpoint?: string }

export function parseRunnerConfig(env: Record<string, string | undefined> = processEnv()): RunnerConfig {
    const config = configSchema.parse({ ...env, S3_ENDPOINT: env.S3_ENDPOINT || undefined })
    return {
        rulesBucket: config.SEMGREP_RULES_BUCKET,
        rulesetEnv: config.SEMGREP_RULESET_ENV,
        rulesBucketOwner: config.SEMGREP_RULES_BUCKET_OWNER,
        s3Endpoint: config.S3_ENDPOINT,
    }
}
