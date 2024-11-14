import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { Upload } from '@aws-sdk/lib-storage'
import { ECRClient, CreateRepositoryCommand, SetRepositoryPolicyCommand } from '@aws-sdk/client-ecr'
import { TEST_ENV } from './config'
import { fromIni } from '@aws-sdk/credential-providers'
import { slugify, pathForStudyRun, pathForStudyRunResults } from '@/lib/paths'
import { uuidToB64 } from '@/lib/uuid'
import { Readable } from 'stream'
import { createHash } from 'crypto'
import { CodeManifest, MinimalRunInfo, MinimalRunResultsInfo } from '@/lib/types'
import { EcrPolicy } from './aws-ecr-policy'

const DEFAULT_TAGS: Record<string, string> = {
    Environment: 'sandbox',
    Target: 'si:analysis',
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
    const resp = await ecrClient.send(
        new CreateRepositoryCommand({
            repositoryName,
            tags: Object.entries(Object.assign(tags, DEFAULT_TAGS)).map(([Key, Value]) => ({ Key, Value })),
        }),
    )
    if (!resp?.repository?.repositoryUri) {
        throw new Error('Failed to create repository')
    }
    await ecrClient.send(
        new SetRepositoryPolicyCommand({
            repositoryName,
            registryId: resp.repository.registryId,
            policyText: JSON.stringify(EcrPolicy),
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
        tags: [
            { Key: 'studyId', Value: info.studyId },
            { Key: 'runId', Value: info.studyRunId },
        ],
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
