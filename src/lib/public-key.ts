export class InvalidPublicKeyError extends Error {}

// A single malformed key breaks encryption for every sender wrapping to that org's recipients,
// so it is caught at storage time. Import params mirror si-encryption's wrapAesKey.
export async function assertValidPublicKey(publicKey: ArrayBuffer): Promise<void> {
    try {
        await crypto.subtle.importKey('spki', publicKey, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt'])
    } catch {
        throw new InvalidPublicKeyError('is not a valid RSA public key')
    }
}
