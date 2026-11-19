import { describe, expect, it } from '@/tests/unit.helpers'
import { encryptedFilesQuery } from '@/components/study/use-security-key-form'

describe('encryptedFilesQuery', () => {
    it('caches a fetch for an earlier key apart from the current key and from the reviewer fetch', () => {
        const byFingerprint = encryptedFilesQuery('job-1', 'researcher', 'old-fingerprint').queryKey
        const current = encryptedFilesQuery('job-1', 'researcher').queryKey
        const reviewer = encryptedFilesQuery('job-1', 'reviewer').queryKey

        expect(byFingerprint).not.toEqual(current)
        expect(byFingerprint).not.toEqual(reviewer)
        expect(current).not.toEqual(reviewer)
        expect(encryptedFilesQuery('job-1', 'researcher', 'old-fingerprint').queryKey).toEqual(byFingerprint)
    })
})
