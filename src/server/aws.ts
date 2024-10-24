import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts'
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { ECRClient, CreateRepositoryCommand } from '@aws-sdk/client-ecr'
import { TEST_ENV } from './config'
import { fromIni } from '@aws-sdk/credential-providers'
import { slugify } from '@/lib/util'
import { uuidToB64 } from '@/lib/uuid'
import fs from 'fs'
import { Readable } from 'stream'
import { createHash } from 'crypto'
import { CodeManifest, CodeFileMinimalRun } from '@/lib/types'

const DEFAULT_TAGS: Record<string, string> = {
    Environment: 'sandbox',
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
    const resp = await getECRClient().send(
        new CreateRepositoryCommand({
            repositoryName,
            tags: Object.entries(Object.assign(tags, DEFAULT_TAGS)).map(([Key, Value]) => ({ Key, Value })),
        }),
    )
    if (!resp?.repository?.repositoryUri) {
        throw new Error('Failed to create repository')
    }
    return resp.repository.repositoryUri
}

const calculateChecksum = async (filePath: string): Promise<string> => {
    const fileBuffer = await fs.promises.readFile(filePath)
    const hash = createHash('sha256')
    hash.update(fileBuffer)
    return hash.digest('base64') // S3 expects the checksum to be base64 encoded
}

export const storeS3File = async (s3Path: string, filePath: string) => {
    if (!process.env.BUCKET_NAME) {
        throw new Error('BUCKET_NAME env var not set')
    }

    const fileStream = fs.createReadStream(filePath)

    await getS3Client().send(
        new PutObjectCommand({
            Bucket: process.env.BUCKET_NAME,
            Key: s3Path,
            Body: fileStream,
            ChecksumSHA256: await calculateChecksum(filePath),
        }),
    )

    return `s3://${process.env.BUCKET_NAME}/${s3Path}`
}

export async function fetchCodeFile(run: CodeFileMinimalRun, path: string) {
    const resp = await getS3Client().send(
        new GetObjectCommand({
            Bucket: 'si-mgmt-app-sandbox',
            Key: `analysis/openstax/${run.studyId}/${run.id}/code/${path}`,
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

export async function fetchCodeManifest(run: CodeFileMinimalRun) {
    const body = await fetchCodeFile(run, 'manifest.json')
    return JSON.parse(body) as CodeManifest
}
