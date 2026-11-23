import { describe, expect, it, vi } from '@/tests/unit.helpers'
import { withS3Prefix } from '@/server/aws'
import { createUploader, prefixedKey } from './s3'

describe('prefixedKey', () => {
    it.each(['', 'pr12/', '/pr12//', 'pr12'])('matches the app for S3_KEY_PREFIX=%j', (prefix) => {
        vi.stubEnv('S3_KEY_PREFIX', prefix)
        const path = 'studies/openstax/s/jobs/j/code/main.py'
        expect(prefixedKey(path, prefix)).toBe(withS3Prefix(path))
    })
})

describe('createUploader', () => {
    it('returns null without BUCKET_NAME so the seed writes rows only', () => {
        expect(createUploader({})).toBeNull()
    })

    it('returns an uploader when BUCKET_NAME is set', () => {
        expect(createUploader({ BUCKET_NAME: 'sample-bucket' })).not.toBeNull()
    })
})
