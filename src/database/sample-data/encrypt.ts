import type { Kysely } from 'kysely'
import { ResultsWriter } from 'si-encryption/job-results/writer'
import type { DB } from '@/database/types'

export type Recipient = { fingerprint: string; publicKey: ArrayBuffer }
// inner file path -> recipient fingerprint -> wrapped AES key
export type EncryptedArchive = { zip: Uint8Array<ArrayBuffer>; keys: Record<string, Record<string, string>> }

export async function orgRecipients(db: Kysely<DB>, orgIds: string[]): Promise<Recipient[]> {
    const rows = await db
        .selectFrom('userPublicKey')
        .innerJoin('orgUser', 'orgUser.userId', 'userPublicKey.userId')
        .select(['userPublicKey.fingerprint', 'userPublicKey.publicKey'])
        .where('orgUser.orgId', 'in', orgIds)
        .execute()
    const byFingerprint = new Map(rows.map((row) => [row.fingerprint, row.publicKey]))
    const recipients = [...byFingerprint].map(([fingerprint, key]) => ({
        fingerprint,
        publicKey: new Uint8Array(key).buffer,
    }))
    const importable = await Promise.all(recipients.map((r) => canWrapFor(r.publicKey)))
    return recipients.filter((_, i) => importable[i])
}

// Same import as wrapAesKey in si-encryption. A key that fails it cannot read the archive anyway,
// and would otherwise make ResultsWriter throw for every other recipient too.
async function canWrapFor(publicKey: ArrayBuffer) {
    try {
        await crypto.subtle.importKey('spki', publicKey, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt'])
        return true
    } catch {
        return false
    }
}

export async function encryptFiles(
    files: { name: string; content: string }[],
    recipients: Recipient[],
    jobId: string,
): Promise<EncryptedArchive | null> {
    if (recipients.length === 0) return null

    const writer = new ResultsWriter(recipients, { jobId })
    for (const file of files) {
        await writer.addFile(file.name, new TextEncoder().encode(file.content).buffer as ArrayBuffer)
    }
    const zip = new Uint8Array(await (await writer.generate()).arrayBuffer())

    const keys = Object.fromEntries(
        Object.entries(writer.manifest.files).map(([path, entry]) => [
            path,
            Object.fromEntries(Object.entries(entry.keys).map(([fingerprint, key]) => [fingerprint, key.crypt])),
        ]),
    )
    return { zip, keys }
}
