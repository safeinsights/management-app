// DB connection config used by Kysely's dialect. Lives outside src/server/
// so kysely-ctl (loaded via jiti, which ignores Node's --conditions flag)
// can construct a Pool without transitively pulling in `server-only`.

import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager'

const ENVIRONMENT_ID = process.env.ENVIRONMENT_ID || 'local'
const CI_ENV = !!process.env.CI

export const DEPLOYED_ENV = !CI_ENV && ENVIRONMENT_ID !== 'local'

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

    const arn = process.env['DB_SECRET_ARN']
    if (!arn) throw new Error('missing ARN DB_SECRET_ARN in env while looking up DATABASE_URL')

    const client = new SecretsManagerClient()
    const data = await client.send(new GetSecretValueCommand({ SecretId: arn }))
    if (!data?.SecretString) throw new Error(`failed to fetch AWS secrets ARN: ${arn}`)

    const db = JSON.parse(data.SecretString) as DBSecrets
    return `postgres://${db.username}:${db.password}@${db.host}/${db.dbname}`
}
