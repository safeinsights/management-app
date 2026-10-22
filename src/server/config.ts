import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager'
import { z } from 'zod'
import { dbConnectionString, fetchSecretJson, type DbSecret } from '../lib/db-connection'

const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).optional(),
    CI: z.string().optional(),
    ENVIRONMENT_ID: z.string().optional(),
    DOMAIN_NAME: z.string().optional(),
    SIMULATE_CODE_BUILD: z.string().optional(),
    SINGLE_USER_EDITING: z.string().optional(),
    SECRETS_ARN: z.string().optional(),
    DB_SECRET_ARN: z.string().optional(),
    DATABASE_URL: z.string().optional(),
    AWS_REGION: z.string().optional(),
    AWS_PROFILE: z.string().optional(),
    AWS_ACCOUNT_ID: z.string().optional(),
    BUCKET_NAME: z.string().optional(),
    S3_KEY_PREFIX: z.string().optional(),
    S3_ENDPOINT: z.string().optional(),
    S3_BROWSER_ENDPOINT: z.string().optional(),
    TEST_DATA_BUCKET_NAME: z.string().optional(),
    ATHENA_RESULTS_BUCKET_NAME: z.string().optional(),
    JOB_QUEUE_URL: z.string().optional(),
    CODE_BUILD_REPOSITORY_DOMAIN: z.string().optional(),
    CONTAINERIZER_PROJECT_NAME: z.string().optional(),
    SCANNER_PROJECT_NAME: z.string().optional(),
    CODEBUILD_WEBHOOK_SECRET: z.string().optional(),
    CODER_API_ENDPOINT: z.string().optional(),
    CODER_TOKEN: z.string().optional(),
    CODER_TEMPLATE: z.string().optional(),
    CODER_FILES: z.string().optional(),
    CODER_ATHENA_WORK_GROUP: z.string().optional(),
    CODER_SAMPLE_DATA_POSTGRES_HOST: z.string().optional(),
    CODER_SAMPLE_DATA_ADMIN_POSTGRES_USER: z.string().optional(),
    CODER_SAMPLE_DATA_READ_ONLY_POSTGRES_USER: z.string().optional(),
    CLERK_SECRET_KEY: z.string().optional(),
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().optional(),
    MAILGUN_API_KEY: z.string().optional(),
    MAILGUN_DOMAIN: z.string().optional(),
    POSTHOG_PROJECT_TOKEN: z.string().optional(),
    CLAUDE_API_KEY: z.string().optional(),
    ANTHROPIC_MODEL: z.string().optional(),
    GITHUB_JOB: z.string().optional(),
    RELEASE_TAG: z.string().optional(),
    RELEASE_SHA: z.string().optional(),
    EDITOR_RELEASE_SHA: z.string().optional(),
    IAC_VERSION: z.string().optional(),
})

export type Env = z.infer<typeof envSchema>
export type ConfigKey = keyof Env

envSchema.parse(process.env)

// Each key is parsed on read rather than once at load: tests swap process.env after this module loads.
export const env = Object.defineProperties(
    {} as Env,
    Object.fromEntries(
        Object.entries(envSchema.shape).map(([key, schema]) => [
            key,
            { get: () => schema.parse(process.env[key]), enumerable: true },
        ]),
    ),
)

export const DEV_ENV = env.NODE_ENV === 'development'

export const CI_ENV = !!env.CI

export const SIMULATE_CODE_BUILD = env.SIMULATE_CODE_BUILD === 't' || (env.SIMULATE_CODE_BUILD != 'f' && DEV_ENV)

export const AWS_ACCOUNT_ENVIRONMENT: Record<string, string> = {
    '533267019973': 'Production',
    '867344442985': 'Staging',
    '905418271997': 'Sandbox',
    '872515273917': 'Development',
}

export const ENVIRONMENT_ID = env.ENVIRONMENT_ID || 'local'

export const PROD_BUILD = env.NODE_ENV === 'production'

export const PROD_ENV = ENVIRONMENT_ID == 'production'
// Not NEXT_PUBLIC_: the build is shared across environments, so a build-time inlined flag could
// not vary per-env. Threaded to the client via the websocket provider.
export const SINGLE_USER_EDITING = env.SINGLE_USER_EDITING === 't'
export const DEPLOYED_ENV = !CI_ENV && ENVIRONMENT_ID !== 'local'
export const CODER_DISABLED = Boolean(CI_ENV || DEV_ENV)

export const APP_BASE_URL = `http${PROD_BUILD ? 's' : ''}://${env.DOMAIN_NAME || 'safeinsights.org'}`

const SECRETS_TTL_MS = 5 * 60_000

const secretsCache = new Map<string, { values: Promise<Record<string, string>>; expiresAt: number }>()

// Keyed by ARN so a rotated value lands within the TTL; a failed fetch is not cached.
function cachedSecrets(arn: string): Promise<Record<string, string>> {
    const cached = secretsCache.get(arn)
    if (cached && cached.expiresAt > Date.now()) return cached.values
    const values = fetchSecretJson<Record<string, string>>(arn, new SecretsManagerClient())
    secretsCache.set(arn, { values, expiresAt: Date.now() + SECRETS_TTL_MS })
    values.catch(() => secretsCache.delete(arn))
    return values
}

export async function getConfigValue(key: ConfigKey, throwIfNotFound?: true): Promise<string>
export async function getConfigValue(key: ConfigKey, throwIfNotFound?: false): Promise<string | null>
export async function getConfigValue(key: ConfigKey, throwIfNotFound = true): Promise<string | null> {
    const envValue = env[key]
    if (envValue != null) return envValue

    const arn = env.SECRETS_ARN
    if (!arn) {
        if (throwIfNotFound) throw new Error(`missing ARN SECRETS_ARN in env while looking up ${key}`)
        return null
    }
    let secret: Record<string, string>
    try {
        secret = await cachedSecrets(arn)
    } catch (e) {
        if (throwIfNotFound) throw e
        return null
    }
    if (throwIfNotFound && !secret[key]) throw new Error(`failed to find ${key} in config`)

    return secret[key] ?? null
}

export async function databaseURL(): Promise<string> {
    if (env.DATABASE_URL) return env.DATABASE_URL
    if (!env.DB_SECRET_ARN) throw new Error('DATABASE_URL or DB_SECRET_ARN is required')

    return dbConnectionString(await fetchSecretJson<DbSecret>(env.DB_SECRET_ARN, new SecretsManagerClient()))
}
