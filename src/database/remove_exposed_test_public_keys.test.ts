import { createHash, randomUUID } from 'node:crypto'
import { type Kysely, sql } from 'kysely'
import { db, describe, expect, it } from '@/tests/unit.helpers'
import { EXPOSED_FINGERPRINT, down, up } from './migrations/1780700000000_remove_exposed_test_public_keys'

// Safe to embed: this key is already public in git history, which is why the migration exists.
const EXPOSED_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAhwpt565psROI0lzRT1i6
AzuENGyqK9MPnEJ4SZ+nZZeXYYm/PzxV/sovltwyOxgD4A/fAvi5hftcscuWpsYR
yox0wx0wKECZ+4DHy8X4iLGdRh9KCM8pddgKHKXnb8/cLEKmzCR/gXSeMG8TkLIo
LV3IjtkoPRj8GZIJxVqqQ/UVtiqcOj4FXbqBiQdydLER8jPhzQLdmXHoHkerxCRy
8HfzjU1M289bGoqW6IAQ1+AIYCemdsrfWqQZEGOrOTJcaWIcdDnwCatr+TC6blCg
WhhfiNGWRLf2Vhuu6uYRhIilo16wGb6woCCm+VsgL6xa5HLvcF5l6cdyerUmKzrB
LMXXpPaO0sTsAR9/QTL8bjXK2DByKqeVQ53cK+FcKCrC+al3pl7Jj8VuFxcCjs3x
7DKreBR8w6BunILrD/dVEYLslKHNTOVtHvFBjJDdX956OKyo7ZQchnbfWQrZyeor
5c9ERtxPqp9Aq++k9aE5pqQ0u4BjgwsLhL9lzsEcBDBF4D3DEJapTKO0LsZLmn36
Ssf4Huw9x9pCzj5jl8VFRfwY42BH/TYwTd6QtDO7cfelOLG/roX6vLP8+lZB8OUF
Viiiv7pMXLecfrwuZZrfg+08UsF8H1vY9P4bw3dmzhHxwF3inIvYpHDAp7tnSFGp
8lwX7mjUqudVA93y6z1U6hsCAwEAAQ==
-----END PUBLIC KEY-----`

const PREFIXED_FINGERPRINT = `SHA2-256(stdin)= ${EXPOSED_FINGERPRINT}`

const pemToDer = (pem: string) => Buffer.from(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''), 'base64')

// pg_temp comes first in the search path, so the migration's unqualified DELETEs only see rows this
// test created. Hitting the real tables would hold row locks that block parallel test workers.
async function withShadowTables(run: (trx: Kysely<unknown>) => Promise<void>) {
    await db.transaction().execute(async (trx) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = trx as any as Kysely<unknown>

        await sql`
            CREATE TEMPORARY TABLE user_public_key (
                id uuid PRIMARY KEY DEFAULT v7uuid(),
                user_id uuid NOT NULL,
                public_key bytea NOT NULL,
                fingerprint text NOT NULL
            ) ON COMMIT DROP
        `.execute(raw)

        await sql`
            CREATE TEMPORARY TABLE study_job_file_recipient_key (
                id uuid PRIMARY KEY DEFAULT v7uuid(),
                study_job_file_id uuid NOT NULL,
                file_path text NOT NULL,
                fingerprint text NOT NULL,
                crypt text NOT NULL
            ) ON COMMIT DROP
        `.execute(raw)

        await run(raw)
    })
}

describe('remove_exposed_test_public_keys migration', () => {
    it('embedded exposed key hashes to the hardcoded fingerprint', () => {
        const fingerprint = createHash('sha256').update(pemToDer(EXPOSED_PUBLIC_KEY_PEM)).digest('hex')
        expect(fingerprint).toEqual(EXPOSED_FINGERPRINT)
    })

    it('removes exposed rows under either fingerprint spelling and leaves others alone', async () => {
        const exposedDer = pemToDer(EXPOSED_PUBLIC_KEY_PEM)

        await withShadowTables(async (trx) => {
            const insertKeyRow = (fingerprint: string, publicKey: Buffer) =>
                sql`
                    INSERT INTO user_public_key (user_id, public_key, fingerprint)
                    VALUES (${randomUUID()}, ${publicKey}, ${fingerprint})
                `.execute(trx)

            await insertKeyRow(EXPOSED_FINGERPRINT, exposedDer)
            await insertKeyRow(PREFIXED_FINGERPRINT, exposedDer)
            await insertKeyRow('fp-survivor', Buffer.from('not the exposed key'))

            const insertRecipientRow = (fingerprint: string) =>
                sql`
                    INSERT INTO study_job_file_recipient_key (study_job_file_id, file_path, fingerprint, crypt)
                    VALUES ('00000000-0000-0000-0000-0000000000aa', 'results.csv', ${fingerprint}, 'crypt')
                `.execute(trx)

            await insertRecipientRow(EXPOSED_FINGERPRINT)
            await insertRecipientRow(PREFIXED_FINGERPRINT)
            await insertRecipientRow('fp-survivor')

            await up(trx)

            const { rows: keyRows } = await sql<{ fingerprint: string }>`
                SELECT fingerprint FROM user_public_key
            `.execute(trx)
            expect(keyRows).toEqual([{ fingerprint: 'fp-survivor' }])

            const { rows: recipientRows } = await sql<{ fingerprint: string }>`
                SELECT fingerprint FROM study_job_file_recipient_key
            `.execute(trx)
            expect(recipientRows).toEqual([{ fingerprint: 'fp-survivor' }])
        })
    })

    it('down() refuses instead of silently restoring nothing', async () => {
        await expect(down()).rejects.toThrow(/irreversible/)
    })
})
