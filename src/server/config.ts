import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'

export const DEV_ENV = !!process && process.env.NODE_ENV === 'development'

export const CI_ENV = !!process && !!process.env.CI

export const TEST_ENV = !!(process.env.CI || process.env.NODE_ENV === 'test')

export const PROD_ENV = process.env.NODE_ENV === 'production'

export const APP_BASE_URL = `http${PROD_ENV ? 's' : ''}://${process.env.DOMAIN_NAME || 'safeinsights.org'}`

export const getUploadTmpDirectory = () => process.env.UPLOAD_TMP_DIRECTORY || '/tmp'

export const SIMULATE_IMAGE_BUILD =
    process.env.SIMULATE_IMAGE_BUILD === 't' || (process.env.SIMULATE_IMAGE_BUILD != 'f' && DEV_ENV)

export const ENCLAVE_AWS_ACCOUNT_NUMBERS = [
    '337909745635', // prod
    '536697261124', // staging
    '084375557107', // dev
    '354918363956', // sandbox
]

export const AWS_ACCOUNT_ENVIRONMENT: Record<string, string> = {
    '533267019973': 'Production',
    '867344442985': 'Staging',
    '905418271997': 'Sandbox',
    '872515273917': 'Development',
}

export const ENVIRONMENT_ID = process.env.ENVIRONMENT_ID || 'dev'

async function fetchSecret<T extends Record<string, unknown>>(envKey: string, throwIfNotFound: boolean): Promise<T> {
    const arn = process.env[envKey]
    if (!arn) {
        if (throwIfNotFound) throw new Error(`missing ARN ${envKey} in env`)
        return {} as T
    }
    try {
        const client = new SecretsManagerClient()
        const data = await client.send(new GetSecretValueCommand({ SecretId: arn }))
        if (!data?.SecretString) {
            if (throwIfNotFound) throw new Error(`failed to fetch AWS secrets ARN: ${arn}`)
            return {} as T
        }
        return JSON.parse(data.SecretString)
    } catch (e) {
        if (throwIfNotFound) throw new Error(`failed to parse AWS secrets: ${e}`)
        return {} as T
    }
}

export async function getConfigValue(key: string, throwIfNotFound?: true): Promise<string>
export async function getConfigValue(key: string, throwIfNotFound?: false): Promise<string | null>
export async function getConfigValue(key: string, throwIfNotFound = true): Promise<string | null> {
    const envValue = process.env[key]
    if (envValue != null) return envValue

    const secret = await fetchSecret<Record<string, string>>('SECRETS_ARN', throwIfNotFound)
    if (throwIfNotFound && !secret[key]) throw new Error(`failed to find ${key} in config`)

    return secret[key]
}

type DBSecrets = {
    dbClusterIdentifier: string
    password: string
    dbname: string
    engine: string
    port: string
    host: string
    username: string
}

export async function databaseURL(): Promise<string> {
    if (process.env['DATABASE_URL']) return process.env['DATABASE_URL']

    const db = await fetchSecret<DBSecrets>('DB_SECRET_ARN', true)

    return `postgres://${db.username}:${db.password}@${db.host}/${db.dbname}`
}

export type SSOCookieConfig = {
    name: string
    private_key: string
    public_key: string
}
