import { createHmac } from 'crypto'

// RFC 6238 (HMAC-SHA1, 30-second steps, 6 digits) from a base32 secret: the code an authenticator
// app would show for the account. Ported from qa-review/src/engine/totp.ts.

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

// RFC 4648 base32, tolerant of the spaces and lowercase a setup screen may show.
export function base32Decode(input: string): Buffer {
    const clean = input.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase()
    let bits = ''
    for (const char of clean) {
        const value = BASE32_ALPHABET.indexOf(char)
        if (value === -1) throw new Error(`invalid base32 character: ${char}`)
        bits += value.toString(2).padStart(5, '0')
    }
    const bytes: number[] = []
    for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(Number.parseInt(bits.slice(i, i + 8), 2))
    return Buffer.from(bytes)
}

export type TotpOptions = { nowMs?: number; stepSeconds?: number; digits?: number }

export function totp(secret: string, { nowMs = Date.now(), stepSeconds = 30, digits = 6 }: TotpOptions = {}): string {
    const counter = Buffer.alloc(8)
    counter.writeBigInt64BE(BigInt(Math.floor(nowMs / 1000 / stepSeconds)))
    const digest = createHmac('sha1', base32Decode(secret)).update(counter).digest()
    const offset = digest[digest.length - 1] & 0xf
    const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits
    return code.toString().padStart(digits, '0')
}
