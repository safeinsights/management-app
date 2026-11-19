import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3'
import { getS3Client } from '@/server/aws'
import { semgrepRulesetConfig } from './config'

// A conditional write lost: the key exists (If-None-Match) or changed (If-Match).
export class RulesetPreconditionFailed extends Error {
    name = 'RulesetPreconditionFailed'
}

export type WriteCondition = { ifNoneMatch: '*' } | { ifMatch: string }

const location = () => {
    const { bucket, owner } = semgrepRulesetConfig()
    return { Bucket: bucket, ExpectedBucketOwner: owner }
}

export async function listKeys(prefix: string, delimiter?: string) {
    const keys: string[] = []
    const commonPrefixes: string[] = []
    let ContinuationToken: string | undefined
    do {
        const page = await getS3Client().send(
            new ListObjectsV2Command({ ...location(), Prefix: prefix, Delimiter: delimiter, ContinuationToken }),
        )
        for (const object of page.Contents ?? []) if (object.Key) keys.push(object.Key)
        for (const common of page.CommonPrefixes ?? []) if (common.Prefix) commonPrefixes.push(common.Prefix)
        ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined
    } while (ContinuationToken)
    return { keys, commonPrefixes }
}

// The ETag stays as S3 returns it, quotes included, so it can go back unchanged in an If-Match.
export async function getText(key: string): Promise<{ body: string; etag: string }> {
    const object = await getS3Client().send(new GetObjectCommand({ ...location(), Key: key }))
    return { body: (await object.Body?.transformToString('utf-8')) ?? '', etag: object.ETag ?? '' }
}

const isPreconditionFailure = (error: unknown) => {
    const status = (error as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata?.httpStatusCode
    return status === 412 || status === 409
}

export async function putText(key: string, body: string, condition: WriteCondition): Promise<string> {
    try {
        const result = await getS3Client().send(
            new PutObjectCommand({
                ...location(),
                Key: key,
                Body: body,
                ContentType: key.endsWith('.json') ? 'application/json' : 'text/plain; charset=utf-8',
                ...('ifMatch' in condition ? { IfMatch: condition.ifMatch } : { IfNoneMatch: condition.ifNoneMatch }),
            }),
        )
        return result.ETag ?? ''
    } catch (error) {
        if (isPreconditionFailure(error)) throw new RulesetPreconditionFailed(key, { cause: error })
        throw error
    }
}
