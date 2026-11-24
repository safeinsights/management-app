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
