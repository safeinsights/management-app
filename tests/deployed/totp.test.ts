import { describe, expect, it } from 'vitest'
import { base32Decode, totp } from './totp'

describe('totp', () => {
    // RFC 6238 appendix B, SHA-1 test vectors, with the 20-byte ASCII secret "12345678901234567890".
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'

    it('decodes base32', () => {
        expect(base32Decode(secret).toString('ascii')).toBe('12345678901234567890')
        expect(base32Decode('gezd gnbv gy3t qojq gezd gnbv gy3t qojq').toString('ascii')).toBe('12345678901234567890')
    })

    it('computes the reference codes', () => {
        expect(totp(secret, { nowMs: 59_000, digits: 8 })).toBe('94287082')
        expect(totp(secret, { nowMs: 1_111_111_109_000, digits: 8 })).toBe('07081804')
        expect(totp(secret, { nowMs: 1_234_567_890_000, digits: 8 })).toBe('89005924')
        expect(totp(secret, { nowMs: 59_000 })).toBe('287082')
    })

    it('rejects a secret that is not base32', () => {
        expect(() => totp('not-base32!')).toThrow(/invalid base32/)
    })
})
