import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createPresignedPost, type PresignedPost } from '@aws-sdk/s3-presigned-post'
import { Upload } from '@aws-sdk/lib-storage'
import { ECRClient, CreateRepositoryCommand, SetRepositoryPolicyCommand } from '@aws-sdk/client-ecr'
import { AWS_ACCOUNT_ENVIRONMENT, TEST_ENV } from './config'
import { fromIni } from '@aws-sdk/credential-providers'
import { pathForStudyRun, pathForStudyRunResults, pathForStudyRunCode } from '@/lib/paths'
import { strToAscii, slugify } from '@/lib/string'
import { uuidToB64 } from '@/lib/uuid'
import { Readable } from 'stream'
import { createHash } from 'crypto'
import { CodeManifest, MinimalRunInfo, MinimalRunResultsInfo } from '@/lib/types'
import { getECRPolicy } from './aws-ecr-policy'

export type { PresignedPost }

export function objectToAWSTags(tags: Record<string, string>) {
    const Environment = AWS_ACCOUNT_ENVIRONMENT[process.env.AWS_ACCOUNT_ID || ''] || 'Unknown'
    return Object.entries({ ...tags, Environment, Application: 'MangementApp' }).map(([Key, Value]) => ({
        Key,
        Value: strToAscii(Value)
            .replace(/[^a-zA-Z0-9]/g, '')
            .slice(0, 256),
    }))
}

let _ecrClient: ECRClient | null = null
export const getECRClient = () =>
    _ecrClient ||
    (_ecrClient = new ECRClient({
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: process.env.AWS_PROFILE ? fromIni({ profile: process.env.AWS_PROFILE }) : undefined,
    }))

let _s3Client: S3Client | null = null
export const getS3Client = () =>
    _s3Client ||
    (_s3Client = new S3Client({
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: process.env.AWS_PROFILE ? fromIni({ profile: process.env.AWS_PROFILE }) : undefined,
    }))

const s3BucketName = () => {
    if (!process.env.BUCKET_NAME) {
        throw new Error('BUCKET_NAME env var not set')
    }
    return process.env.BUCKET_NAME
}

export function generateRepositoryPath(opts: { memberIdentifier: string; studyId: string; studyTitle: string }) {
    return `si/analysis/${opts.memberIdentifier}/${uuidToB64(opts.studyId).toLowerCase()}/${slugify(opts.studyTitle)}`
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

export async function createAnalysisRepository(repositoryName: string, tags: Record<string, string> = {}) {
    const ecrClient = getECRClient()
    const { accountId } = await getAWSInfo()
    const resp = await ecrClient.send(
        new CreateRepositoryCommand({
            repositoryName,
            tags: objectToAWSTags({ ...tags, Target: 'si:analysis' }),
        }),
    )
    if (!resp?.repository?.repositoryUri) {
        throw new Error('Failed to create repository')
    }

    await ecrClient.send(
        new SetRepositoryPolicyCommand({
            repositoryName,
            registryId: resp.repository.registryId,
            policyText: JSON.stringify(getECRPolicy(accountId)),
        }),
    )
    return resp.repository.repositoryUri
}

const calculateChecksum = async (body: ReadableStream) => {
    const hash = createHash('sha256')
    const reader = body.getReader()
    let done, value
    while (!done) {
        ;({ done, value } = await reader.read())
        if (value) {
            hash.update(value)
        }
    }
    return hash.digest('base64')
}

export const storeResultsFile = async (info: MinimalRunResultsInfo, body: ReadableStream) => {
    const [csStream, upStream] = body.tee()
    const hash = await calculateChecksum(csStream)
    const uploader = new Upload({
        client: getS3Client(),
        tags: objectToAWSTags({ studyId: info.studyId, runId: info.studyRunId }),
        params: {
            Bucket: s3BucketName(),
            ChecksumSHA256: hash,
            Key: pathForStudyRunResults(info),
            Body: upStream,
        },
    })
    await uploader.done()
}

export async function fetchCodeFile(info: MinimalRunInfo, path: string) {
    const resp = await getS3Client().send(
        new GetObjectCommand({
            Bucket: s3BucketName(),
            Key: `${pathForStudyRun(info)}/code/${path}`,
        }),
    )
    if (!resp.Body) throw new Error('no body recieved from s3')

    const stream = resp.Body as Readable
    const chunks: Buffer[] = []

    for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk))
    }

    return Buffer.concat(chunks).toString('utf-8')
}

export async function fetchCodeManifest(info: MinimalRunInfo) {
    const body = await fetchCodeFile(info, 'manifest.json')
    return JSON.parse(body) as CodeManifest
}

export async function urlForResults(info: MinimalRunResultsInfo) {
    const path = pathForStudyRunResults(info)
    const url = await getSignedUrl(getS3Client(), new GetObjectCommand({ Bucket: s3BucketName(), Key: path }), {
        expiresIn: 3600,
    })
    return url
}

export async function urlForStudyRunCodeUpload(info: MinimalRunInfo) {
    const bucket = s3BucketName()
    const prefix = pathForStudyRunCode(info)
    const psPost = await createPresignedPost(getS3Client(), {
        Bucket: bucket,
        Conditions: [['starts-with', '$key', prefix]],
        Expires: 3600, // seconds, == one hour
        Key: prefix + '/${filename}', // single quotes are intentional, S3 will replace ${filename} with the filename
    })
    return psPost
}

export async function fetchStudyRunResults(info: MinimalRunResultsInfo) {
    const path = pathForStudyRunResults(info)
    const result = await getS3Client().send(new GetObjectCommand({ Bucket: s3BucketName(), Key: path }))
    if (!result.Body) throw new Error(`no file recieved from s3 for run result ${info.studyRunId}`)
    return result.Body
}
