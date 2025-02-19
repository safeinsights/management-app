import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'

export const DEV_ENV = !!process && process.env.NODE_ENV === 'development'

export const TEST_ENV = !!(process.env.CI || process.env.NODE_ENV === 'test')

export const PROD_ENV = process.env.NODE_ENV === 'production'


export const getUploadTmpDirectory = () => process.env.UPLOAD_TMP_DIRECTORY || '/tmp'

export const ALWAYS_CREATE_ECR = process.env.ALWAYS_CREATE_ECR === 't'

export const USING_CONTAINER_REGISTRY = ALWAYS_CREATE_ECR || PROD_ENV

export const USING_S3_STORAGE = process.env.USE_S3_STORAGE === 't' || PROD_ENV

export const SIMULATE_RESULTS_UPLOAD =
    process.env.SIMULATE_RESULTS_UPLOAD === 't' || (process.env.SIMULATE_RESULTS_UPLOAD != 'f' && DEV_ENV)

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

async function fetchSecret<T extends Record<string, unknown>>(SecretId: string): Promise<T> {
    if (!SecretId) throw new Error('missing SECRET_ARN env var')
    try {
        const client = new SecretsManagerClient()
        const data = await client.send(new GetSecretValueCommand({ SecretId }))

        if (data.SecretString) {
            return JSON.parse(data.SecretString)
        }
    } catch {
        throw new Error(`failed to fetch ${SecretId} from AWS secrets`)
    }
    return {} as any // eslint-disable-line @typescript-eslint/no-explicit-any
}

export async function getConfigValue(key: string): Promise<string> {
    const envValue = process.env[key]
    if (envValue != null) return envValue

    const secret = await fetchSecret<Record<string, string>>('SECRETS_ARN')
    if (!secret[key]) throw new Error(`failed to find ${key} in config`)
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

    const db = await fetchSecret<DBSecrets>('DB_SECRET_ARN')

    return `postgres://${db.username}:${db.password}@${db.host}/${db.dbname}`
}

export type SSOCookieConfig = {
    name: string
    private_key: string
    public_key: string
}
