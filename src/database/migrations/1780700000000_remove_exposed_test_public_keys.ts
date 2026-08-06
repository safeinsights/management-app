import { type Kysely, sql } from 'kysely'

// tests/support/private_key.pem was committed to this repo in October 2024. Its public half was
// written into user_public_key by a test seed that, because of a broken environment check in the
// infrastructure, ran against every environment including production. Any result wrapped for
// these rows is decryptable by anyone with repo access, so the rows are removed everywhere,
// along with the study_job_file_recipient_key rows holding AES keys wrapped to them. The keypair
// itself is rotated in the same change, which only prevents future use — this migration is what
// removes the existing exposure. In long-lived non-production environments, artifacts whose only
// recipient keys are removed here become undecryptable; recipients re-share or regenerate them.
//
// Expected to affect zero rows in production; running it is how we establish that, so each
// DELETE logs its row count.
export const EXPOSED_FINGERPRINT = '5b67466d712b406f54d7ec37b1ab1ac58687eb3a604a5ed8ccb1e4cca4dd06cc'

export async function up(db: Kysely<unknown>): Promise<void> {
    // Recipient-key fingerprints are copied from user_public_key rows, whose two writers spelled
    // the same fingerprint differently: the Kysely seed (1743608138837_test_users.ts) stored
    // bare hex, bin/seed-environment.ts inserted tests/support/public_key.sig verbatim with its
    // "SHA2-256(stdin)= " prefix. Matching both spellings covers every row either writer could
    // have produced, including rows orphaned by an earlier key replacement.
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
    // Non-production environments get the rotated key back on the next seed run.
    throw new Error('irreversible: the exposed test key rows must not be restored')
}
