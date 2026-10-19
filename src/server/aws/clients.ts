import { S3Client } from '@aws-sdk/client-s3'
import { AWS_ACCOUNT_ENVIRONMENT } from '../config'
import { fromIni } from '@aws-sdk/credential-providers'
import { strToAscii } from '@/lib/string'

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

let _s3BrowserClient: S3Client | null = null
export const getS3BrowserClient = () =>
    _s3BrowserClient ||
    (_s3BrowserClient = new S3Client({
        region: process.env.AWS_REGION || 'us-east-1',
        forcePathStyle: true,
        endpoint: process.env.S3_BROWSER_ENDPOINT || process.env.S3_ENDPOINT,
        credentials: process.env.AWS_PROFILE ? fromIni({ profile: process.env.AWS_PROFILE }) : undefined,
    }))
