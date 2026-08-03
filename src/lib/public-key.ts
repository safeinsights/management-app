export class InvalidPublicKeyError extends Error {}

/**
 * Reject keys that aren't importable RSA SPKI DER. A single malformed key in an org breaks
 * encryption for every sender wrapping to that org's recipients (TOA results upload, the
 * reviewer's approve/re-wrap), so catch it at storage time. Import params mirror si-encryption's
 * wrapAesKey.
 */
export async function assertValidPublicKey(publicKey: ArrayBuffer): Promise<void> {
    try {
        await crypto.subtle.importKey('spki', publicKey, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt'])
    } catch {
        throw new InvalidPublicKeyError('is not a valid RSA public key')
    }
}
