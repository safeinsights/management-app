import { GlueClient, DeleteDatabaseCommand, DeleteTableCommand, GetTablesCommand } from '@aws-sdk/client-glue'
import { env } from '@/server/config'
import { awsCredentials } from './clients'

let _glueClient: GlueClient | null = null
const getGlueClient = () =>
    _glueClient ||
    (_glueClient = new GlueClient({
        region: env.AWS_REGION || 'us-east-1',
        credentials: awsCredentials(),
    }))

export async function deleteAthenaDatabase(dbName: string) {
    try {
        await getGlueClient().send(new DeleteDatabaseCommand({ Name: dbName }))
    } catch (err: unknown) {
        if (err instanceof Error && err.name === 'EntityNotFoundException') return
        throw err
    }
}

export async function deleteAllAthenaTables(dbName: string) {
    try {
        const result = await getGlueClient().send(new GetTablesCommand({ DatabaseName: dbName }))
        for (const table of result.TableList || []) {
            if (table.Name) {
                await getGlueClient().send(new DeleteTableCommand({ DatabaseName: dbName, Name: table.Name }))
            }
        }
    } catch (err: unknown) {
        if (err instanceof Error && err.name === 'EntityNotFoundException') return
        throw err
    }
}
