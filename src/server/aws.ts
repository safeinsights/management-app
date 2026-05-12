import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts'
import {
    CopyObjectCommand,
    DeleteObjectCommand,
    DeleteObjectsCommand,
    GetObjectCommand,
    ListObjectsV2Command,
    S3Client,
} from '@aws-sdk/client-s3'
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
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { CodeBuildClient, StartBuildCommand } from '@aws-sdk/client-codebuild'
import { Upload } from '@aws-sdk/lib-storage'
import { Signer } from '@aws-sdk/rds-signer'
import PG from 'pg'
import { AWS_ACCOUNT_ENVIRONMENT, ENVIRONMENT_ID, TEST_ENV, getConfigValue } from './config'
import { fromIni } from '@aws-sdk/credential-providers'
import {
    pathForCodeEnvScanArtifacts,
    pathForJobScanArtifacts,
    pathForSampleData,
    pathForStudyJobCode,
} from '@/lib/paths'
import type { MinimalCodeEnvInfo } from '@/lib/types'
import { strToAscii } from '@/lib/string'
import { parseCsv } from '@/lib/file-content-helpers'
import logger from '@/lib/logger'
import { Readable } from 'stream'
import { MinimalJobInfo, MinimalOrgInfo, MinimalStudyInfo } from '@/lib/types'
import { createPresignedPost } from '@aws-sdk/s3-presigned-post'

export function objectToAWSTags(tags: Record<string, string>) {
    const Environment = AWS_ACCOUNT_ENVIRONMENT[process.env.AWS_ACCOUNT_ID || ''] || 'Unknown'
    return Object.entries({ ...tags, Environment, Application: 'Management App' }).map(([Key, Value]) => ({
        Key,
        Value: strToAscii(Value).slice(0, 256),
    }))
}

let _s3Client: S3Client | null = null
export const getS3Client = () =>
    _s3Client ||
    (_s3Client = new S3Client({
        region: process.env.AWS_REGION || 'us-east-1',
        forcePathStyle: true,
        endpoint: process.env.S3_ENDPOINT,
        credentials: process.env.AWS_PROFILE ? fromIni({ profile: process.env.AWS_PROFILE }) : undefined,
    }))

// For Pre-signed URLs and client calls
let _s3BrowserClient: S3Client | null = null
export const getS3BrowserClient = () =>
    _s3BrowserClient ||
    (_s3BrowserClient = new S3Client({
        region: process.env.AWS_REGION || 'us-east-1',
        forcePathStyle: true,
        endpoint: process.env.S3_BROWSER_ENDPOINT || process.env.S3_ENDPOINT,
        credentials: process.env.AWS_PROFILE ? fromIni({ profile: process.env.AWS_PROFILE }) : undefined,
    }))

let _glueClient: GlueClient | null = null
const getGlueClient = () =>
    _glueClient ||
    (_glueClient = new GlueClient({
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: process.env.AWS_PROFILE ? fromIni({ profile: process.env.AWS_PROFILE }) : undefined,
    }))

const safeDbNameRegex = /^[a-z0-9_]+$/

export const toDbName = (orgSlug: string, identifier: string) => {
    const name = `${orgSlug}_${identifier}`.replace(/-/g, '_')
    if (!safeDbNameRegex.test(name)) {
        throw new Error(`Invalid database name: ${name}`)
    }
    return name
}

export const toAthenaDbName = toDbName
export const toPgDbName = toDbName

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

export const testDataBucketName = (): string | null => process.env.TEST_DATA_BUCKET_NAME || null

export function sanitizeColumnName(raw: string): string {
    let name = raw
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
    if (!name || /^\d/.test(name)) name = `col_${name}`
    return name
}

export async function inferColumnsFromCsv(s3Key: string): Promise<Column[]> {
    const result = await getS3Client().send(
        new GetObjectCommand({
            Bucket: s3BucketName(),
            Key: s3Key,
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

export type CopiedTable = { tableName: string; sourceKey: string }

export async function copyToTestDataBucket(sourcePrefix: string, targetPrefix: string): Promise<CopiedTable[]> {
    const bucket = testDataBucketName()
    if (!bucket) {
        logger.error('TEST_DATA_BUCKET_NAME not configured, skipping copy to test-data bucket')
        return []
    }

    const sourceBucket = s3BucketName()
    const listed = await getS3Client().send(new ListObjectsV2Command({ Bucket: sourceBucket, Prefix: sourcePrefix }))
    if (!listed.Contents?.length) return []

    const tables: CopiedTable[] = []
    for (const obj of listed.Contents) {
        if (!obj.Key) continue
        const fileName = obj.Key.split('/').pop() || ''
        if (!fileName.toLowerCase().endsWith('.csv')) continue
        const tableName = sanitizeColumnName(fileName.replace(/\.csv$/i, ''))
        tables.push({ tableName, sourceKey: obj.Key })

        const targetKey = `${targetPrefix}/${tableName}/${fileName}`
        await getS3Client().send(
            new CopyObjectCommand({
                Bucket: bucket,
                CopySource: `${sourceBucket}/${obj.Key}`,
                Key: targetKey,
            }),
        )
    }
    return tables
}

export async function deleteTestDataBucketPrefix(prefix: string) {
    const bucket = testDataBucketName()
    if (!bucket) return

    const listed = await getS3Client().send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }))
    if (!listed.Contents?.length) return

    const objectsToDelete = listed.Contents.map(({ Key }) => ({ Key }))
    await getS3Client().send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objectsToDelete } }))
}

async function connectToPgAdmin(database = 'postgres'): Promise<PG.Client> {
    const hostPort = await getConfigValue('CODER_SAMPLE_DATA_POSTGRES_HOST')
    const [hostname, portStr] = hostPort.split(':')
    const port = parseInt(portStr, 10)
    const username = await getConfigValue('CODER_SAMPLE_DATA_ADMIN_POSTGRES_USER')

    const signer = new Signer({
        hostname,
        port,
        username,
        credentials: process.env.AWS_PROFILE ? fromIni({ profile: process.env.AWS_PROFILE }) : undefined,
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

    // GRANT CONNECT must be run from any database (it's a cluster-level privilege)
    const adminClient = await connectToPgAdmin()
    try {
        await adminClient.query(`GRANT CONNECT ON DATABASE "${dbName}" TO ${readOnlyUser}`)
    } finally {
        await adminClient.end()
    }

    // Schema and table grants must be run while connected to the target database
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
        if (err instanceof Error && 'code' in err && err.code === '42P04') return // 42P04 == 'DUPLICATE DATABASE'
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

export const s3BucketName = () => {
    if (!process.env.BUCKET_NAME) {
        throw new Error('BUCKET_NAME env var not set')
    }
    return process.env.BUCKET_NAME
}

export const completePathForSampleData = (parts: MinimalCodeEnvInfo & { sampleDataPath?: string }) =>
    `s3://${s3BucketName()}/${pathForSampleData(parts)}`

export async function codeBuildRepositoryUrl(info: MinimalStudyInfo) {
    return process.env.CODE_BUILD_REPOSITORY_DOMAIN + `/${info.orgSlug}/code-builds/${ENVIRONMENT_ID}`
}

export const getAWSInfo = async () => {
    const region = process.env.AWS_REGION || 'us-east-1'
    if (TEST_ENV) {
        return { accountId: '000000000000', region }
    }
    if (process.env.AWS_ACCOUNT_ID) {
        return { accountId: process.env.AWS_ACCOUNT_ID, region }
    }
    const client = new STSClient({})
    const command = new GetCallerIdentityCommand({})
    const response = await client.send(command)
    const accountId = response.Account
    if (!accountId) throw new Error('Failed to get AWS account ID')

    return {
        accountId,
        region,
    }
}

export const storeS3File = async (
    info: MinimalStudyInfo | MinimalJobInfo | MinimalOrgInfo,
    body: ReadableStream,
    Key: string,
) => {
    const uploader = new Upload({
        client: getS3Client(),
        tags: objectToAWSTags(info),
        params: {
            Bucket: s3BucketName(),
            Key,
            Body: body,
        },
    })
    await uploader.done()
}

export async function signedUrlForFile(
    Key: string,
    commandOverrides: Partial<{ ResponseContentDisposition: string }> = {},
) {
    return await getSignedUrl(
        getS3BrowserClient(),
        new GetObjectCommand({ Bucket: s3BucketName(), Key, ...commandOverrides }),
        { expiresIn: 3600 },
    )
}

export const createSignedUploadUrl = async (path: string) => {
    return await createPresignedPost(getS3BrowserClient(), {
        Bucket: s3BucketName(),
        Expires: 3600,
        Conditions: [['starts-with', '$key', path]],
        Key: path + '/${filename}', // single quotes are intentional, S3 will replace ${filename} with the filename
    })
}

export const deleteS3File = async (Key: string) => {
    await getS3Client().send(
        new DeleteObjectCommand({
            Bucket: s3BucketName(),
            Key,
        }),
    )
}

export const deleteFolderContents = async (folderPath: string) => {
    const listCommand = new ListObjectsV2Command({
        Bucket: s3BucketName(),
        Prefix: folderPath,
    })

    const listedObjects = await getS3Client().send(listCommand)

    if (!listedObjects.Contents) {
        console.error('No objects found in the folder.')
        return
    }

    const objectsToDelete = listedObjects.Contents.map(({ Key }) => ({ Key }))

    if (objectsToDelete.length > 20) {
        throw new Error('cowardly refusing to delete more than 10 files at once')
    }

    const deleteCommand = new DeleteObjectsCommand({
        Bucket: s3BucketName(),
        Delete: { Objects: objectsToDelete },
    })

    await getS3Client().send(deleteCommand)
}

export const moveFolderContents = async (oldPrefix: string, newPrefix: string) => {
    const Bucket = s3BucketName()
    const listedObjects = await getS3Client().send(new ListObjectsV2Command({ Bucket, Prefix: oldPrefix }))

    if (!listedObjects.Contents?.length) return

    for (const obj of listedObjects.Contents) {
        if (!obj.Key) continue
        const suffix = obj.Key.slice(oldPrefix.length)
        const newKey = newPrefix + suffix
        await getS3Client().send(new CopyObjectCommand({ Bucket, CopySource: `${Bucket}/${obj.Key}`, Key: newKey }))
    }

    await getS3Client().send(
        new DeleteObjectsCommand({
            Bucket,
            Delete: { Objects: listedObjects.Contents.map(({ Key }) => ({ Key })) },
        }),
    )
}

export async function fetchS3File(Key: string) {
    const result = await getS3Client().send(new GetObjectCommand({ Bucket: s3BucketName(), Key }))
    if (!result.Body) throw new Error(`no file received from s3 for path ${Key}`)
    return result.Body as Readable
}

async function buildCodeBuildEnvVars(webhookEndpoint: string, vars: Record<string, string | object>) {
    return Object.entries({
        WEBHOOK_SECRET: await getConfigValue('CODEBUILD_WEBHOOK_SECRET'),
        WEBHOOK_ENDPOINT: webhookEndpoint,
        ...vars,
    }).map(([name, value]) => ({ name, value: typeof value === 'object' ? JSON.stringify(value) : value }))
}

export async function triggerBuildImageForJob(
    info: MinimalJobInfo & {
        codeEnvURL: string
        codeEntryPointFileName: string
        cmdLine: string
        containerLocation: string
    },
) {
    const cmd = info.cmdLine.replace('%f', info.codeEntryPointFileName)
    const codebuild = new CodeBuildClient({})
    const result = await codebuild.send(
        new StartBuildCommand({
            projectName: process.env.CONTAINERIZER_PROJECT_NAME || `MgmntAppContainerizer-${ENVIRONMENT_ID}`,
            environmentVariablesOverride: await buildCodeBuildEnvVars('/api/services/containerizer', {
                ON_START_PAYLOAD: { jobId: info.studyJobId, status: 'JOB-PACKAGING' },
                ON_SUCCESS_PAYLOAD: { jobId: info.studyJobId, status: 'JOB-READY' },
                ON_FAILURE_PAYLOAD: { jobId: info.studyJobId, status: 'JOB-ERRORED' },
                STUDY_JOB_ID: info.studyJobId,
                S3_PATH: pathForStudyJobCode(info),
                DOCKER_CMD_LINE: cmd,
                DOCKER_BASE_IMAGE_LOCATION: info.codeEnvURL,
                DOCKER_CODE_LOCATION: `${info.containerLocation}:${info.studyJobId}`,
            }),
        }),
    )
    if (!result.build) throw new Error(`failed to start packaging. requestID: ${result.$metadata.requestId}`)
}

export async function triggerScanForStudyJob(info: MinimalJobInfo) {
    const codebuild = new CodeBuildClient({})
    const result = await codebuild.send(
        new StartBuildCommand({
            projectName: process.env.SCANNER_PROJECT_NAME || `MgmntAppScanner-${ENVIRONMENT_ID}`,
            environmentVariablesOverride: await buildCodeBuildEnvVars('/api/services/job-scan-results', {
                ON_START_PAYLOAD: { jobId: info.studyJobId, status: 'CODE-SUBMITTED' },
                ON_SUCCESS_PAYLOAD: { jobId: info.studyJobId, status: 'CODE-SCANNED' },
                ON_FAILURE_PAYLOAD: { jobId: info.studyJobId, status: 'JOB-ERRORED' },
                SCAN_MODE: 'source',
                STUDY_JOB_ID: info.studyJobId,
                S3_PATH: pathForStudyJobCode(info),
                ARTIFACTS_PATH: pathForJobScanArtifacts(info),
            }),
        }),
    )
    if (!result.build) throw new Error(`failed to start scan. requestID: ${result.$metadata.requestId}`)
}

export async function triggerScanForCodeEnv(info: { codeEnvId: string; imageUrl: string }) {
    const codebuild = new CodeBuildClient({})
    const result = await codebuild.send(
        new StartBuildCommand({
            projectName: process.env.SCANNER_PROJECT_NAME || `MgmntAppScanner-${ENVIRONMENT_ID}`,
            environmentVariablesOverride: await buildCodeBuildEnvVars('/api/services/code-env-scan-results', {
                ON_START_PAYLOAD: { codeEnvId: info.codeEnvId, status: 'SCAN-RUNNING' },
                ON_SUCCESS_PAYLOAD: { codeEnvId: info.codeEnvId, status: 'SCAN-COMPLETE' },
                ON_FAILURE_PAYLOAD: { codeEnvId: info.codeEnvId, status: 'SCAN-FAILED' },
                SCAN_MODE: 'image',
                CODE_ENV_ID: info.codeEnvId,
                DOCKER_IMAGE_URL: info.imageUrl,
                ARTIFACTS_PATH: pathForCodeEnvScanArtifacts(info),
            }),
        }),
    )
    if (!result.build) throw new Error(`failed to start scan. requestID: ${result.$metadata.requestId}`)
}
