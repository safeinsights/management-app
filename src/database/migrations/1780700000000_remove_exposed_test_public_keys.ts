import { type Kysely, sql } from 'kysely'

// tests/support/private_key.pem was committed to this repo in October 2024. Its public half was
// written into user_public_key by a test seed that, because of a broken environment check in the
// infrastructure, ran against every environment including production. Any result wrapped for
// these rows is decryptable by anyone with repo access, so the rows are removed everywhere. The
// keypair itself is rotated in the same change, which only prevents future use — this migration
// is what removes the existing exposure.
//
// Expected to affect zero rows in production; running it is how we establish that.
//
// Matched three ways because the two seed paths wrote different spellings of the same
// fingerprint: the Kysely seed (1743608138837_test_users.ts) stores bare hex, while
// bin/seed-environment.ts inserts tests/support/public_key.sig verbatim, including its
// "SHA2-256(stdin)= " prefix. The public_key comparison is authoritative — it hashes the stored
// key bytes, so it catches rows under any fingerprint spelling, including none at all.
const EXPOSED_FINGERPRINT = '5b67466d712b406f54d7ec37b1ab1ac58687eb3a604a5ed8ccb1e4cca4dd06cc'

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`
        DELETE FROM user_public_key
        WHERE fingerprint = ${EXPOSED_FINGERPRINT}
           OR fingerprint = ${`SHA2-256(stdin)= ${EXPOSED_FINGERPRINT}`}
           OR encode(sha256(public_key), 'hex') = ${EXPOSED_FINGERPRINT}
    `.execute(db)
}

export async function down(): Promise<void> {
    // Deliberately irreversible: restoring a publicly-known key is never the right outcome.
    // Non-production environments get the rotated key back on the next seed run.
}
