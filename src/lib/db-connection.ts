// Shared by the app and the editor service, which is built on Node strip-types: keep this file to
// erasable TypeScript (no enums, no parameter properties) and package imports only.
import { GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'
import awsCaBundle from 'aws-ssl-profiles'

export type DbSecret = {
    username: string
    password: string
    host: string
    dbname: string
}

// Minimal surface of SecretsManagerClient, so tests can pass a stub.
export type SecretFetcher = {
    send(command: GetSecretValueCommand): Promise<{ SecretString?: string }>
}

export async function fetchSecretJson<T>(arn: string, client: SecretFetcher): Promise<T> {
    const data = await client.send(new GetSecretValueCommand({ SecretId: arn }))
    if (!data?.SecretString) throw new Error(`failed to fetch AWS secret ${arn}`)
    try {
        return JSON.parse(data.SecretString) as T
    } catch (e) {
        throw new Error(`failed to parse AWS secret ${arn}: ${e}`)
    }
}

export function dbConnectionString({ username, password, host, dbname }: DbSecret): string {
    return `postgres://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}/${dbname}`
}

// Aurora Postgres has rds.force_ssl=1; verify its certificate against the RDS CA bundle.
export const RDS_SSL = { ca: awsCaBundle.ca, rejectUnauthorized: true }

export type DbEnv = { DATABASE_URL?: string; DB_SECRET_ARN?: string }

// DATABASE_URL for local/dev; otherwise the RDS secret, fetched fresh so a rotated password lands.
export async function resolveDatabaseURL(env: DbEnv, client: SecretFetcher): Promise<string> {
    if (env.DATABASE_URL) return env.DATABASE_URL
    if (!env.DB_SECRET_ARN) throw new Error('DATABASE_URL or DB_SECRET_ARN is required')
    return dbConnectionString(await fetchSecretJson<DbSecret>(env.DB_SECRET_ARN, client))
}
