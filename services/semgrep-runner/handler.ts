import { S3Client } from '@aws-sdk/client-s3'
import { z } from 'zod'
import { RULESET_ENVS, runnerRequestSchema, type RunnerResponse } from './protocol.ts'
import { runRequest, type RulesetStorage } from './run.ts'
import { spawnCommand } from './semgrep-command.ts'

// Leaves time to return the "did not complete" response before Lambda kills the invocation.
export const DEADLINE_MARGIN_MS = 15_000

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

export type RunnerConfig = Omit<RulesetStorage, 's3'> & { s3Endpoint?: string }

export function parseRunnerConfig(env: Record<string, string | undefined>): RunnerConfig {
    const config = configSchema.parse({ ...env, S3_ENDPOINT: env.S3_ENDPOINT || undefined })
    return {
        rulesBucket: config.SEMGREP_RULES_BUCKET,
        rulesetEnv: config.SEMGREP_RULESET_ENV,
        rulesBucketOwner: config.SEMGREP_RULES_BUCKET_OWNER,
        s3Endpoint: config.S3_ENDPOINT,
    }
}

let storage: RulesetStorage | undefined
function rulesetStorage(): RulesetStorage {
    if (!storage) {
        const { s3Endpoint, ...config } = parseRunnerConfig(process.env)
        storage = { ...config, s3: new S3Client({ forcePathStyle: true, endpoint: s3Endpoint }) }
    }
    return storage
}

type LambdaContext = { getRemainingTimeInMillis(): number }

// A Lambda timeout at or below the margin would abort every run before Semgrep starts; that is a
// deploy error, so it fails the invocation instead of reading as a scan that did not complete.
export function deadlineSignal(context: LambdaContext): AbortSignal {
    const remaining = context.getRemainingTimeInMillis()
    if (remaining <= DEADLINE_MARGIN_MS) {
        throw new Error(`Lambda timeout must be longer than ${DEADLINE_MARGIN_MS / 1000} s, ${remaining} ms left`)
    }
    return AbortSignal.timeout(remaining - DEADLINE_MARGIN_MS)
}

function logRun(response: RunnerResponse, startedAt: number) {
    // Counts only: file names and code can be student data.
    console.warn(
        JSON.stringify({
            mode: response.mode,
            outcome: response.outcome,
            error: response.error,
            findings: response.mode === 'test' ? response.findings.length : undefined,
            durationMs: Date.now() - startedAt,
        }),
    )
}

export async function handler(event: unknown, context: LambdaContext): Promise<RunnerResponse> {
    const startedAt = Date.now()
    const request = runnerRequestSchema.parse(event)
    const response = await runRequest(request, {
        semgrep: spawnCommand,
        signal: deadlineSignal(context),
        storage: request.mode === 'scan' ? rulesetStorage() : undefined,
    })
    logRun(response, startedAt)
    return response
}
