import { Signer } from '@aws-sdk/rds-signer'
import PG from 'pg'
import { getConfigValue } from '@/server/config'
import { awsCredentials } from './clients'

async function connectToPgAdmin(database = 'postgres'): Promise<PG.Client> {
    const hostPort = await getConfigValue('CODER_SAMPLE_DATA_POSTGRES_HOST')
    const [hostname, portStr] = hostPort.split(':')
    const port = parseInt(portStr, 10)
    const username = await getConfigValue('CODER_SAMPLE_DATA_ADMIN_POSTGRES_USER')

    const signer = new Signer({
        hostname,
        port,
        username,
        credentials: awsCredentials(),
    })

    const token = await signer.getAuthToken()
    const client = new PG.Client({
        host: hostname,
        port,
        user: username,
        password: token,
        database,
        ssl: true,
    })

    await client.connect()
    return client
}

async function grantReadOnlyAccess(dbName: string) {
    const readOnlyUser = await getConfigValue('CODER_SAMPLE_DATA_READ_ONLY_POSTGRES_USER')

    // GRANT CONNECT is a cluster-level privilege, so it runs from any database.
    const adminClient = await connectToPgAdmin()
    try {
        await adminClient.query(`GRANT CONNECT ON DATABASE "${dbName}" TO ${readOnlyUser}`)
    } finally {
        await adminClient.end()
    }

    // Schema and table grants require a connection to the target database.
    const dbClient = await connectToPgAdmin(dbName)
    try {
        await dbClient.query(`GRANT USAGE ON SCHEMA public TO ${readOnlyUser}`)
        await dbClient.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${readOnlyUser}`)
        await dbClient.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ${readOnlyUser}`)
    } finally {
        await dbClient.end()
    }
}

export async function createPgDatabase(dbName: string) {
    const client = await connectToPgAdmin()
    try {
        await client.query(`CREATE DATABASE "${dbName}"`)
    } catch (err: unknown) {
        if (err instanceof Error && 'code' in err && err.code === '42P04') return // DUPLICATE DATABASE
        throw err
    } finally {
        await client.end()
    }

    await grantReadOnlyAccess(dbName)
}

export async function deletePgDatabase(dbName: string) {
    const client = await connectToPgAdmin()
    try {
        await client.query(`DROP DATABASE "${dbName}"`)
    } catch (err: unknown) {
        if (err instanceof Error && 'code' in err && err.code === '3D000') return
        throw err
    } finally {
        await client.end()
    }
}
