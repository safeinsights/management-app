import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts'
import { S3Client, type S3ClientConfig, PutObjectCommand } from '@aws-sdk/client-s3'
import {
    ECRClient,
    CreateRepositoryCommand,
    CreateRepositoryCommandInput,
    type ECRClientConfig,
} from '@aws-sdk/client-ecr'
import { TEST_ENV } from './config'
import { fromIni } from '@aws-sdk/credential-providers'
import { slugify } from '@/lib/util'
import { uuidToB64 } from '@/lib/uuid'
import fs from 'fs'
import { createHash } from 'crypto'

export function generateRepositoryPath(opts: { memberIdentifier: string; studyId: string; studyTitle: string }) {
    return `si/analysis/${opts.memberIdentifier}/${uuidToB64(opts.studyId)}/${slugify(opts.studyTitle)}`
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

export class ECR {
    defaultTags: Record<string, string> = {
        Environemnt: 'sandbox',
    }

    client: ECRClient

    constructor() {
        const config: ECRClientConfig = { region: process.env.AWS_REGION || 'us-east-1' }
        if (process.env.AWS_PROFILE) {
            config.credentials = fromIni({ profile: process.env.AWS_PROFILE })
        }
        this.client = new ECRClient(config)
    }

    async createAnalysisRepository(repositoryName: string, tags: Record<string, string> = {}) {
        const input: CreateRepositoryCommandInput = {
            repositoryName,
            tags: Object.entries(Object.assign(tags, this.defaultTags)).map(([Key, Value]) => ({ Key, Value })),
        }
        const command = new CreateRepositoryCommand(input)
        const resp = await this.client.send(command)
        if (!resp?.repository?.repositoryUri) {
            throw new Error('Failed to create repository')
        }
        return resp.repository.repositoryUri
    }
}

const calculateChecksum = async (filePath: string): Promise<string> => {
    const fileBuffer = await fs.promises.readFile(filePath)
    const hash = createHash('sha256')
    hash.update(fileBuffer)
    return hash.digest('base64') // S3 expects the checksum to be base64 encoded
}

export const storeS3File = async (s3Path: string, filePath: string) => {
    const config: S3ClientConfig = { region: process.env.AWS_REGION || 'us-east-1' }
    if (process.env.AWS_PROFILE) {
        config.credentials = fromIni({ profile: process.env.AWS_PROFILE })
    }
    if (!process.env.BUCKET_NAME) {
        throw new Error('BUCKET_NAME env var not set')
    }

    const fileStream = fs.createReadStream(filePath)

    const client = new S3Client(config)
    await client.send(
        new PutObjectCommand({
            Bucket: process.env.BUCKET_NAME,
            Key: s3Path,
            Body: fileStream,
            ChecksumSHA256: await calculateChecksum(filePath),
        }),
    )

    return `s3://${process.env.BUCKET_NAME}/${s3Path}`
}
