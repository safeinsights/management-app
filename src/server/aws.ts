import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts'
import {
    DeleteObjectCommand,
    DeleteObjectsCommand,
    GetObjectCommand,
    ListObjectsV2Command,
    S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { CodeBuildClient, StartBuildCommand } from '@aws-sdk/client-codebuild'
import { Upload } from '@aws-sdk/lib-storage'
import { AWS_ACCOUNT_ENVIRONMENT, ENVIRONMENT_ID, TEST_ENV, getConfigValue } from './config'
import { fromIni } from '@aws-sdk/credential-provider-ini'
import { pathForStudyJobCode } from '@/lib/paths'
import { strToAscii } from '@/lib/string'
import { Readable } from 'stream'
import { createHash } from 'crypto'
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

export const s3BucketName = () => {
    if (!process.env.BUCKET_NAME) {
        throw new Error('BUCKET_NAME env var not set')
    }
    return process.env.BUCKET_NAME
}

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

export const storeS3File = async (
    info: MinimalStudyInfo | MinimalJobInfo | MinimalOrgInfo,
    body: ReadableStream,
    Key: string,
) => {
    const [csStream, upStream] = body.tee()
    const hash = await calculateChecksum(csStream)
    const uploader = new Upload({
        client: getS3Client(),
        tags: objectToAWSTags(info),
        params: {
            Bucket: s3BucketName(),
            ChecksumSHA256: hash,
            Key,
            Body: upStream,
        },
    })
    await uploader.done()
}

export async function signedUrlForFile(Key: string) {
    return await getSignedUrl(getS3BrowserClient(), new GetObjectCommand({ Bucket: s3BucketName(), Key }), {
        expiresIn: 3600,
    })
}

export const signedUrlForStudyUpload = async (path: string) => {
    return await createPresignedPost(getS3BrowserClient(), {
        Bucket: s3BucketName(),
        Expires: 3600,
        Conditions: [['starts-with', '$key', path]],
        Key: path + '/${filename}', // single quotes are intentional, S3 will replace ${filename} with the filename
    })
}

export const signedUrlForSampleDataUpload = async (path: string) => {
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

export async function fetchS3File(Key: string) {
    const result = await getS3Client().send(new GetObjectCommand({ Bucket: s3BucketName(), Key }))
    if (!result.Body) throw new Error(`no file received from s3 for path ${Key}`)
    return result.Body as Readable
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
            projectName: process.env.CODE_BUILD_PROJECT_NAME || `MgmntAppContainerizer-${ENVIRONMENT_ID}`,
            environmentVariablesOverride: [
                {
                    name: 'WEBHOOK_SECRET',
                    value: await getConfigValue('CONTAINERIZER_WEBHOOK_SECRET'),
                },
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
                {
                    name: 'ON_FAILURE_PAYLOAD',
                    value: JSON.stringify({
                        jobId: info.studyJobId,
                        status: 'JOB-ERRORED',
                    }),
                },
                { name: 'STUDY_JOB_ID', value: info.studyJobId },
                { name: 'S3_PATH', value: pathForStudyJobCode(info) },
                { name: 'DOCKER_CMD_LINE', value: cmd },
                { name: 'DOCKER_BASE_IMAGE_LOCATION', value: info.codeEnvURL },
                { name: 'DOCKER_CODE_LOCATION', value: `${info.containerLocation}:${info.studyJobId}` },
            ],
        }),
    )
    if (!result.build) throw new Error(`failed to start packaging. requestID: ${result.$metadata.requestId}`)
}
