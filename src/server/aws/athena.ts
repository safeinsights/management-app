import { GetObjectCommand } from '@aws-sdk/client-s3'
import {
    GlueClient,
    CreateDatabaseCommand,
    DeleteDatabaseCommand,
    CreateTableCommand,
    DeleteTableCommand,
    GetTablesCommand,
    type DatabaseInput,
    type Column,
} from '@aws-sdk/client-glue'
import { parseCsv } from '@/lib/file-content-helpers'
import { env } from '@/server/config'
import { awsCredentials, getS3Client } from './clients'
import { sanitizeColumnName } from './naming'
import { s3BucketName, withS3Prefix } from './s3'

let _glueClient: GlueClient | null = null
const getGlueClient = () =>
    _glueClient ||
    (_glueClient = new GlueClient({
        region: env.AWS_REGION || 'us-east-1',
        credentials: awsCredentials(),
    }))

export async function createAthenaDatabase(dbName: string) {
    const input: DatabaseInput = { Name: dbName }
    try {
        await getGlueClient().send(new CreateDatabaseCommand({ DatabaseInput: input }))
    } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AlreadyExistsException') return
        throw err
    }
}

export async function deleteAthenaDatabase(dbName: string) {
    try {
        await getGlueClient().send(new DeleteDatabaseCommand({ Name: dbName }))
    } catch (err: unknown) {
        if (err instanceof Error && err.name === 'EntityNotFoundException') return
        throw err
    }
}

export async function inferColumnsFromCsv(s3Key: string): Promise<Column[]> {
    const result = await getS3Client().send(
        new GetObjectCommand({
            Bucket: s3BucketName(),
            Key: withS3Prefix(s3Key),
            Range: 'bytes=0-8192',
        }),
    )
    const text = await result.Body?.transformToString()
    if (!text) throw new Error(`Empty file at ${s3Key}`)

    const headerLine = text.split('\n')[0]
    const { headers } = parseCsv(headerLine)

    const seen = new Set<string>()
    return headers.map((raw) => {
        let name = sanitizeColumnName(raw)
        while (seen.has(name)) name = `${name}_dup`
        seen.add(name)
        return { Name: name, Type: 'string' }
    })
}

export async function createAthenaTable(dbName: string, tableName: string, columns: Column[], s3Location: string) {
    try {
        await getGlueClient().send(
            new CreateTableCommand({
                DatabaseName: dbName,
                TableInput: {
                    Name: tableName,
                    TableType: 'EXTERNAL_TABLE',
                    Parameters: {
                        classification: 'csv',
                        'skip.header.line.count': '1',
                    },
                    StorageDescriptor: {
                        Columns: columns,
                        Location: s3Location,
                        InputFormat: 'org.apache.hadoop.mapred.TextInputFormat',
                        OutputFormat: 'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat',
                        SerdeInfo: {
                            SerializationLibrary: 'org.apache.hadoop.hive.serde2.OpenCSVSerde',
                            Parameters: {
                                separatorChar: ',',
                                quoteChar: '"',
                                escapeChar: '\\',
                            },
                        },
                    },
                },
            }),
        )
    } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AlreadyExistsException') return
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
