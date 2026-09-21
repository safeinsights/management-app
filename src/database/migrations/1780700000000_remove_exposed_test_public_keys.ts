import { type Kysely, sql } from 'kysely'

// A test seed leaked tests/support/private_key.pem's public half into user_public_key on every
// environment, so anything wrapped for these rows is decryptable by anyone with repo access.
export const EXPOSED_FINGERPRINT = '5b67466d712b406f54d7ec37b1ab1ac58687eb3a604a5ed8ccb1e4cca4dd06cc'

export async function up(db: Kysely<unknown>): Promise<void> {
    // Two writers spelled the fingerprint differently: bare hex, and public_key.sig verbatim with
    // its "SHA2-256(stdin)= " prefix.
    const recipientKeys = await sql`
        DELETE FROM study_job_file_recipient_key
        WHERE fingerprint = ${EXPOSED_FINGERPRINT}
           OR fingerprint = ${`SHA2-256(stdin)= ${EXPOSED_FINGERPRINT}`}
    `.execute(db)
    console.warn(`removed ${recipientKeys.numAffectedRows ?? 0} recipient key row(s) wrapped to the exposed key`)

    // Hashing the stored key bytes catches rows under any fingerprint spelling, including none.
    const publicKeys = await sql`
        DELETE FROM user_public_key
        WHERE encode(sha256(public_key), 'hex') = ${EXPOSED_FINGERPRINT}
    `.execute(db)
    console.warn(`removed ${publicKeys.numAffectedRows ?? 0} exposed public key row(s)`)
}

export async function down(): Promise<void> {
    // Deliberately irreversible: restoring a publicly-known key is never the right outcome.
    throw new Error('irreversible: the exposed test key rows must not be restored')
}
