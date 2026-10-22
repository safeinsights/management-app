import { describe, it, expect } from 'vitest'
import { dockerImageRefSchema } from '@/schema/code-env'

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
