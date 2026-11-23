import { describe, expect, it } from '@/tests/unit.helpers'
import { dockerImageRefSchema, normalizeImageRef } from './code-env'

const SCHEME_ERROR = 'Remove the http:// or https:// prefix'

describe('dockerImageRefSchema', () => {
    it.each(['https://harbor.safeinsights.org/org/image:1.0', 'http://harbor.safeinsights.org/org/image:1.0'])(
        'rejects %s with a message naming the scheme',
        (value) => {
            const result = dockerImageRefSchema.safeParse(value)
            expect(result.success).toBe(false)
            expect(result.error?.issues).toHaveLength(1)
            expect(result.error?.issues[0].message).toContain(SCHEME_ERROR)
        },
    )

    it('trims surrounding whitespace', () => {
        expect(dockerImageRefSchema.parse('  harbor.safeinsights.org/org/image:1.0 ')).toBe(
            'harbor.safeinsights.org/org/image:1.0',
        )
    })

    it.each(['harbor.safeinsights.org/org/image:1.0', `org/image@sha256:${'a'.repeat(64)}`, 'localhost:5000/image'])(
        'accepts %s',
        (value) => {
            expect(dockerImageRefSchema.safeParse(value).success).toBe(true)
        },
    )
})

describe('normalizeImageRef', () => {
    it.each([
        [' https://harbor.safeinsights.org/org/image:1.0 ', 'harbor.safeinsights.org/org/image:1.0'],
        ['HTTP://harbor.safeinsights.org/org/image', 'harbor.safeinsights.org/org/image'],
        ['harbor.safeinsights.org/org/image:1.0', 'harbor.safeinsights.org/org/image:1.0'],
        ['localhost:5000/image', 'localhost:5000/image'],
    ])('normalizes %j to %j', (value, expected) => {
        expect(normalizeImageRef(value)).toBe(expected)
    })
})
