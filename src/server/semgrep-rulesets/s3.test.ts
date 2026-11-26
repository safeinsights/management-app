import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3'
import { describe, expect, it } from '@/tests/unit.helpers'
import { RULES_BUCKET, RULES_BUCKET_OWNER, stubRulesBucket } from '@/tests/semgrep-rules-s3.helpers'
import { getText, listKeys, putText, RulesetPreconditionFailed } from './s3'

describe('rules bucket helpers', () => {
    it('sends the bucket and its expected owner on every call', async () => {
        const bucket = stubRulesBucket()
        await putText('rulesets/dev/v1/version.json', '{}', { ifNoneMatch: '*' })
        await listKeys('rulesets/dev/', '/')
        await getText('rulesets/dev/v1/version.json')

        const inputs = [
            ...bucket.s3.commandCalls(PutObjectCommand),
            ...bucket.s3.commandCalls(ListObjectsV2Command),
            ...bucket.s3.commandCalls(GetObjectCommand),
        ].map((call) => call.args[0].input)
        expect(inputs).toHaveLength(3)
        for (const input of inputs)
            expect(input).toMatchObject({ Bucket: RULES_BUCKET, ExpectedBucketOwner: RULES_BUCKET_OWNER })
    })

    it('writes JSON and text with their content types and returns the ETag', async () => {
        const bucket = stubRulesBucket()
        const etag = await putText('rulesets/dev/v1/rules/a.yaml', 'rules: []', { ifNoneMatch: '*' })
        await putText('rulesets/dev/v1/version.json', '{}', { ifNoneMatch: '*' })

        const [yaml, json] = bucket.s3.commandCalls(PutObjectCommand).map((call) => call.args[0].input)
        expect(yaml).toMatchObject({ ContentType: 'text/plain; charset=utf-8', IfNoneMatch: '*' })
        expect(yaml).not.toHaveProperty('ACL')
        expect(json.ContentType).toBe('application/json')
        expect(await getText('rulesets/dev/v1/rules/a.yaml')).toEqual({ body: 'rules: []', etag })
    })

    it('maps a lost conditional write, 412 or 409, to RulesetPreconditionFailed', async () => {
        const bucket = stubRulesBucket()
        const etag = await putText('rulesets/dev/published.json', '{}', { ifNoneMatch: '*' })

        await expect(putText('rulesets/dev/published.json', '{}', { ifNoneMatch: '*' })).rejects.toThrow(
            RulesetPreconditionFailed,
        )
        await expect(putText('rulesets/dev/published.json', '{}', { ifMatch: '"other"' })).rejects.toThrow(
            RulesetPreconditionFailed,
        )
        await expect(putText('rulesets/dev/published.json', '{"v":2}', { ifMatch: etag })).resolves.not.toBe(etag)

        bucket.s3
            .on(PutObjectCommand)
            .rejects(Object.assign(new Error('ConditionalRequestConflict'), { $metadata: { httpStatusCode: 409 } }))
        await expect(putText('rulesets/dev/x.json', '{}', { ifNoneMatch: '*' })).rejects.toThrow(
            RulesetPreconditionFailed,
        )
        bucket.s3
            .on(PutObjectCommand)
            .rejects(Object.assign(new Error('AccessDenied'), { $metadata: { httpStatusCode: 403 } }))
        await expect(putText('rulesets/dev/x.json', '{}', { ifNoneMatch: '*' })).rejects.toThrow('AccessDenied')
    })

    it('lists keys and folders one level deep with a delimiter', async () => {
        const bucket = stubRulesBucket()
        bucket.put('rulesets/dev/published.json', '{}')
        bucket.put('rulesets/dev/v1/version.json', '{}')
        bucket.put('rulesets/dev/v2/rules/a.yaml', '')

        expect(await listKeys('rulesets/dev/', '/')).toEqual({
            keys: ['rulesets/dev/published.json'],
            commonPrefixes: ['rulesets/dev/v1/', 'rulesets/dev/v2/'],
        })
    })
})
