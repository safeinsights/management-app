import { describe, expect, it, vi } from '@/tests/unit.helpers'
import { withS3Prefix } from '@/server/aws'
import { createUploader, prefixedKey, staleKeys } from './s3'

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

describe('staleKeys', () => {
    const seeded = 'studies/mars-u/s/jobs/j/code/main.R'
    const uploadedByQa = 'studies/mars-u/s/jobs/qa-job/code/main.R'

    it.each(['', 'pr12'])('keeps the seeded files and returns the rest (S3_KEY_PREFIX=%j)', (prefix) => {
        const listed = [seeded, uploadedByQa].map((path) => prefixedKey(path, prefix))
        expect(staleKeys(listed, [seeded], prefix)).toEqual([prefixedKey(uploadedByQa, prefix)])
    })
})
