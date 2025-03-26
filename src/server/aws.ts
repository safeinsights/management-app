import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { CodeBuildClient, StartBuildCommand } from '@aws-sdk/client-codebuild'
import { createPresignedPost, type PresignedPost } from '@aws-sdk/s3-presigned-post'
import { Upload } from '@aws-sdk/lib-storage'
import { ECRClient } from '@aws-sdk/client-ecr'
import { AWS_ACCOUNT_ENVIRONMENT, getUploadTmpDirectory, PROD_ENV, TEST_ENV, USING_S3_STORAGE } from './config'
import { fromIni } from '@aws-sdk/credential-provider-ini'
import { pathForStudyJob, pathForStudyJobCode, pathForStudyJobResults } from '@/lib/paths'
import { strToAscii } from '@/lib/string'
import { Readable } from 'stream'
import { createHash } from 'crypto'
import {
    CodeManifest,
    isMinimalStudyRunInfo,
    MinimalJobInfo,
    MinimalJobResultsInfo,
    MinimalStudyInfo,
} from '@/lib/types'

import fs from 'fs'
import path from 'path'

export type { PresignedPost }

export function objectToAWSTags(tags: Record<string, string>) {
    const Environment = AWS_ACCOUNT_ENVIRONMENT[process.env.AWS_ACCOUNT_ID || ''] || 'Unknown'
    return Object.entries({ ...tags, Environment, Application: 'Management App' }).map(([Key, Value]) => ({
        Key,
        Value: strToAscii(Value).slice(0, 256),
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

const awsEnvironmentId = () => {
    return process.env.ENVIRONMENT_ID || 'dev'
}

// we currently use a single ECR, but in the future we may use a different one for each member and/or study
export async function codeBuildRepositoryUrl(_info: MinimalStudyInfo) {
    const repoName = process.env.CODE_BUILD_ECR_NAME || 'si/analysis/code-builds/${awsEnvironmentId()}'
    const { accountId, region } = await getAWSInfo()
    return `${accountId}.dkr.ecr.${region}.amazonaws.com/${repoName}`
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

export const storeStudyFile = async (
    info: MinimalStudyInfo | MinimalJobResultsInfo,
    body: ReadableStream,
    Key: string,
) => {
    const [csStream, upStream] = body.tee()
    const hash = await calculateChecksum(csStream)
    const uploader = new Upload({
        client: getS3Client(), // jobId: info.studyJobId//
        tags: objectToAWSTags({
            studyId: info.studyId,
            ...(isMinimalStudyRunInfo(info) ? { studyJobId: info.studyJobId } : {}),
        }),
        params: {
            Bucket: s3BucketName(),
            ChecksumSHA256: hash,
            Key,
            Body: upStream,
        },
    })
    await uploader.done()
}

export async function fetchCodeFile(info: MinimalJobInfo, path: string) {
    const resp = await getS3Client().send(
        new GetObjectCommand({
            Bucket: s3BucketName(),
            Key: `${pathForStudyJob(info)}/code/${path}`,
        }),
    )
    if (!resp.Body) throw new Error('no body received from s3')

    const stream = resp.Body as Readable
    const chunks: Buffer[] = []

    for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk))
    }

    return Buffer.concat(chunks).toString('utf-8')
}

export async function fetchCodeManifest(info: MinimalJobInfo) {
    if (USING_S3_STORAGE) {
        const body = await fetchCodeFile(info, 'manifest.json')
        return JSON.parse(body) as CodeManifest
    } else {
        if (PROD_ENV) throw new Error('This method is only available in development')
        const dir = path.join(getUploadTmpDirectory(), pathForStudyJobCode(info), path.dirname('manifest.json'))
        const buf = fs.readFileSync(path.join(dir, path.basename('manifest.json')))
        return JSON.parse(buf.toString('utf-8'))
    }
}

export async function urlForResults(info: MinimalJobResultsInfo) {
    const path = pathForStudyJobResults(info)
    return await getSignedUrl(getS3Client(), new GetObjectCommand({ Bucket: s3BucketName(), Key: path }), {
        expiresIn: 3600,
    })
}

export async function urlForStudyJobCodeUpload(info: MinimalJobInfo) {
    const bucket = s3BucketName()
    const prefix = pathForStudyJobCode(info)
    const psPost = await createPresignedPost(getS3Client(), {
        Bucket: bucket,
        Conditions: [['starts-with', '$key', prefix]],
        Expires: 3600, // seconds, == one hour
        Key: prefix + '/${filename}', // single quotes are intentional, S3 will replace ${filename} with the filename
    })
    return psPost
}

export async function fetchStudyJobResults(info: MinimalJobResultsInfo) {
    const path = pathForStudyJobResults(info)
    const result = await getS3Client().send(new GetObjectCommand({ Bucket: s3BucketName(), Key: path }))
    if (!result.Body) throw new Error(`no file received from s3 for job result ${info.studyJobId}`)
    return result.Body
}

export async function triggerBuildImageForJob(info: MinimalJobInfo) {
    const codebuild = new CodeBuildClient({})

    const result = await codebuild.send(
        new StartBuildCommand({
            projectName: `MgmntAppContainerizer-${awsEnvironmentId()}`,
            environmentVariablesOverride: [
                {
                    name: 'ON_START_PAYLOAD',
                    value: JSON.stringify({
                        jobId: info.studyJobId,
                        status: 'JOB-PACKAGING',
                    }),
                },
                {
                    name: 'ON_SUCCESS_PAYLOAD',
                    value: JSON.stringify({
                        jobId: info.studyJobId,
                        status: 'JOB-READY',
                    }),
                },
                { name: 'S3_PATH', value: pathForStudyJobCode(info) },
                { name: 'DOCKER_TEMPLATE_FILE_NAME', value: `Dockerfile.template.r` },
                { name: 'DOCKER_CMD_LINE', value: `CMD ["Rscript", "main.r"]` },
                { name: 'DOCKER_TAG', type: 'PLAINTEXT', value: info.studyJobId },
            ],
        }),
    )
    if (!result.build) throw new Error(`failed to start packaging. requestID: ${result.$metadata.requestId}`)
}
