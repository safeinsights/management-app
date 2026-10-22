import { describe, it, expect } from 'vitest'
import { composeImageRef, dockerImageRefSchema, imageDigestError, splitImageRef } from '@/schema/code-env'

const digest = `sha256:${'a'.repeat(64)}`

describe('dockerImageRefSchema', () => {
    it.each([
        `harbor.safeinsights.org/openstax/r-base:2025-05-15@${digest}`,
        `harbor.safeinsights.org/openstax/r-base@${digest}`,
        `localhost:5000/img:v1@${digest}`,
        `python@${digest}`,
    ])('accepts pinned reference %s', (ref) => {
        expect(dockerImageRefSchema.safeParse(ref).success).toBe(true)
    })

    it.each([
        'harbor.safeinsights.org/openstax/r-base:2025-05-15',
        'python:3.11',
        `img@sha512:${'a'.repeat(64)}`,
        `img@sha256:${'a'.repeat(63)}`,
        `img@sha256:${'A'.repeat(64)}`,
        `img@${digest}:v1`,
        '',
    ])('rejects %s', (ref) => {
        expect(dockerImageRefSchema.safeParse(ref).success).toBe(false)
    })
})

describe('imageDigestError', () => {
    it.each([digest, 'a'.repeat(64), `  SHA256:${'A'.repeat(64)} `])('accepts %s', (value) => {
        expect(imageDigestError(value)).toBeNull()
    })

    it.each([
        ['', 'Image digest is required'],
        ['sha256:771722e4', 'Digest looks truncated; a sha256 digest is 64 hex characters'],
        ['771722e4', 'Digest looks truncated; a sha256 digest is 64 hex characters'],
        [`sha512:${'a'.repeat(64)}`, 'Must be a sha256 digest (e.g., sha256:<64 hex characters>)'],
        [`sha256:${'g'.repeat(64)}`, 'Must be a sha256 digest (e.g., sha256:<64 hex characters>)'],
    ])('rejects %s', (value, message) => {
        expect(imageDigestError(value)).toBe(message)
    })
})

describe('composeImageRef and splitImageRef', () => {
    it('round-trips a pinned reference', () => {
        const ref = `harbor.safeinsights.org/openstax/r-base:2025-05-15@${digest}`
        const { url, digest: split } = splitImageRef(ref)
        expect(url).toBe('harbor.safeinsights.org/openstax/r-base:2025-05-15')
        expect(composeImageRef(url, split)).toBe(ref)
    })

    it('adds the sha256 prefix to a bare hex digest', () => {
        expect(composeImageRef('python:3.11', 'a'.repeat(64))).toBe(`python:3.11@${digest}`)
    })

    it('splits a legacy unpinned reference with an empty digest', () => {
        expect(splitImageRef('python:3.11')).toEqual({ url: 'python:3.11', digest: '' })
    })
})
