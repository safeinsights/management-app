import { describe, it, expect } from '@/tests/unit.helpers'
import { scrubText } from './sentry-scrub-text'

describe('scrubText', () => {
    it('redacts URL-encoded emails', () => {
        expect(scrubText('/invite?identifier=pat%40example.org')).toBe('/invite?identifier=[Filtered]')
    })
})
