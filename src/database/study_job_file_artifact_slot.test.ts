import { type Kysely, sql } from 'kysely'
import { describe, expect, it } from 'vitest'
import { db, insertTestOrg, insertTestStudyData } from '@/tests/unit.helpers'
import { collapseArtifactSlots } from './migrations/1780500000000_dedupe_study_job_file_artifacts'

// Verifies the partial unique index and the backfill added in
// 1780500000000_dedupe_study_job_file_artifacts.ts. An artifact slot is one
// (study_job_id, path, file_type); code file types are outside the index.
describe('study_job_file artifact slots', () => {
    async function setupJob() {
        const org = await insertTestOrg()
        const { jobIds } = await insertTestStudyData({ org })
        return jobIds[0]
    }

    function artifactRow(studyJobId: string, overrides: Partial<{ path: string; fileType: 'ENCRYPTED-RESULT' }> = {}) {
        return {
            studyJobId,
            name: 'encrypted-results.zip',
            path: `test-org/${studyJobId}/results/encrypted-results.zip`,
            fileType: 'ENCRYPTED-RESULT' as const,
            ...overrides,
        }
    }

    it('rejects a second row for an artifact slot the job already has', async () => {
        const studyJobId = await setupJob()
        await db.insertInto('studyJobFile').values(artifactRow(studyJobId)).execute()

        await expect(db.insertInto('studyJobFile').values(artifactRow(studyJobId)).execute()).rejects.toThrow(
            /study_job_file_artifact_slot_unique/,
        )
    })

    // Pre-2025-06-26 runs wrote a log and a result to the same path, so those rows differ only by
    // file_type. Including the type in the key is what lets them stay in the table untouched.
    it('allows rows of different types on one path', async () => {
        const studyJobId = await setupJob()
        await db.insertInto('studyJobFile').values(artifactRow(studyJobId)).execute()
        await db
            .insertInto('studyJobFile')
            .values({ ...artifactRow(studyJobId), fileType: 'ENCRYPTED-CODE-RUN-LOG' })
            .execute()

        const rows = await db.selectFrom('studyJobFile').select('id').where('studyJobId', '=', studyJobId).execute()
        expect(rows).toHaveLength(2)
    })

    // Submitted code is outside the index on purpose: two uploads can sanitize to one path, and a
    // constrained submit would fail outright rather than write a row nobody minds.
    it('leaves code file rows unconstrained', async () => {
        const studyJobId = await setupJob()
        const codeRow = { studyJobId, name: 'main.r', path: `test-org/${studyJobId}/code/main.r` }

        await db
            .insertInto('studyJobFile')
            .values({ ...codeRow, fileType: 'MAIN-CODE' })
            .execute()
        await db
            .insertInto('studyJobFile')
            .values({ ...codeRow, fileType: 'MAIN-CODE' })
            .execute()

        const rows = await db.selectFrom('studyJobFile').select('id').where('studyJobId', '=', studyJobId).execute()
        expect(rows).toHaveLength(2)
    })

    // The backfill runs against duplicates the index now forbids, so it is exercised on temporary
    // tables of the same names inside one transaction. pg_temp comes first in the search path, so the
    // migration's unqualified SQL resolves to these; ON COMMIT DROP keeps the pooled connection clean
    // and nothing locks the real tables while other test files run in parallel.
    describe('collapseArtifactSlots', () => {
        async function withSeededDuplicates(
            seed: (trx: Kysely<unknown>) => Promise<void>,
            assert: (trx: Kysely<unknown>) => Promise<void>,
        ) {
            await db.transaction().execute(async (trx) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const raw = trx as any as Kysely<unknown>

                // source_id mirrors the real column: a self-reference with no ON DELETE clause, so
                // NO ACTION applies and a referenced row cannot be deleted. Without it here the
                // backfill's foreign key hazard would not be reproducible.
                await sql`
                    CREATE TEMPORARY TABLE study_job_file (
                        id uuid PRIMARY KEY DEFAULT v7uuid(),
                        study_job_id uuid NOT NULL,
                        path text NOT NULL,
                        name text NOT NULL,
                        file_type study_job_file_type NOT NULL,
                        source_id uuid REFERENCES study_job_file (id),
                        created_at timestamptz NOT NULL DEFAULT now()
                    ) ON COMMIT DROP
                `.execute(raw)

                await sql`
                    CREATE TEMPORARY TABLE study_job_file_recipient_key (
                        id uuid PRIMARY KEY DEFAULT v7uuid(),
                        study_job_file_id uuid NOT NULL REFERENCES study_job_file (id) ON DELETE CASCADE,
                        file_path text NOT NULL,
                        fingerprint text NOT NULL,
                        crypt text NOT NULL,
                        UNIQUE (study_job_file_id, file_path, fingerprint)
                    ) ON COMMIT DROP
                `.execute(raw)

                await seed(raw)
                await collapseArtifactSlots(raw)
                await assert(raw)
            })
        }

        const insertSlotRow = (trx: Kysely<unknown>, name: string, minutesAgo: number) =>
            sql<{ id: string }>`
            INSERT INTO study_job_file (study_job_id, path, name, file_type, created_at)
            VALUES (
                '00000000-0000-0000-0000-0000000000aa',
                'jobs/results/encrypted-results.zip',
                ${name},
                'ENCRYPTED-RESULT',
                now() - (${minutesAgo} || ' minutes')::interval
            )
            RETURNING id
        `.execute(trx)

        const grantKey = (trx: Kysely<unknown>, fileId: string, filePath: string, fingerprint = 'fp-researcher') =>
            sql`
            INSERT INTO study_job_file_recipient_key (study_job_file_id, file_path, fingerprint, crypt)
            VALUES (${fileId}, ${filePath}, ${fingerprint}, 'crypt')
        `.execute(trx)

        it('keeps the newest row and carries every recipient key onto it', async () => {
            await withSeededDuplicates(
                async (trx) => {
                    const oldest = (await insertSlotRow(trx, 'first-delivery.zip', 30)).rows[0].id
                    const middle = (await insertSlotRow(trx, 'second-delivery.zip', 20)).rows[0].id
                    const newest = (await insertSlotRow(trx, 'third-delivery.zip', 10)).rows[0].id

                    // Keys spread across the rows about to be deleted, including one the survivor
                    // already holds: a researcher granted through any duplicate must keep access.
                    await grantKey(trx, oldest, 'results.csv')
                    await grantKey(trx, middle, 'summary.csv')
                    await grantKey(trx, newest, 'results.csv')
                },
                async (trx) => {
                    const { rows: files } = await sql<{ name: string }>`
                        SELECT name FROM study_job_file
                    `.execute(trx)
                    expect(files).toEqual([{ name: 'third-delivery.zip' }])

                    // Aliased to one word because CamelCasePlugin rewrites result column names.
                    const { rows: keys } = await sql<{ granted: string }>`
                        SELECT k.file_path AS granted
                          FROM study_job_file_recipient_key k
                          JOIN study_job_file f ON f.id = k.study_job_file_id
                         ORDER BY k.file_path
                    `.execute(trx)
                    expect(keys).toEqual([{ granted: 'results.csv' }, { granted: 'summary.csv' }])
                },
            )
        })

        // Approval records the encrypted row an APPROVED-* row came from. On a job that already held
        // duplicates that reference can point at one this backfill drops, and source_id is NO ACTION,
        // so a delete without repointing it first fails the whole migration.
        it('repoints an approved row that referenced a deleted duplicate', async () => {
            await withSeededDuplicates(
                async (trx) => {
                    const released = (await insertSlotRow(trx, 'released.zip', 30)).rows[0].id
                    await insertSlotRow(trx, 'redelivered.zip', 10)

                    await sql`
                        INSERT INTO study_job_file (study_job_id, path, name, file_type, source_id)
                        VALUES (
                            '00000000-0000-0000-0000-0000000000aa',
                            'jobs/results/approved/results.csv',
                            'results.csv',
                            'APPROVED-RESULT',
                            ${released}
                        )
                    `.execute(trx)
                },
                async (trx) => {
                    const { rows } = await sql<{ name: string; source: string | null }>`
                        SELECT a.name, s.name AS source
                          FROM study_job_file a
                          LEFT JOIN study_job_file s ON s.id = a.source_id
                         WHERE a.file_type = 'APPROVED-RESULT'
                    `.execute(trx)
                    expect(rows).toEqual([{ name: 'results.csv', source: 'redelivered.zip' }])
                },
            )
        })

        it('leaves rows of differing types on one path in place', async () => {
            await withSeededDuplicates(
                async (trx) => {
                    await insertSlotRow(trx, 'results.zip', 20)
                    await sql`
                        INSERT INTO study_job_file (study_job_id, path, name, file_type)
                        VALUES (
                            '00000000-0000-0000-0000-0000000000aa',
                            'jobs/results/encrypted-results.zip',
                            'legacy-log.zip',
                            'ENCRYPTED-CODE-RUN-LOG'
                        )
                    `.execute(trx)
                },
                async (trx) => {
                    const { rows } = await sql<{ count: string }>`SELECT count(*) FROM study_job_file`.execute(trx)
                    expect(Number(rows[0].count)).toBe(2)
                },
            )
        })

        it('leaves duplicate code file rows in place', async () => {
            await withSeededDuplicates(
                async (trx) => {
                    for (const _ of [1, 2]) {
                        await sql`
                            INSERT INTO study_job_file (study_job_id, path, name, file_type)
                            VALUES ('00000000-0000-0000-0000-0000000000aa', 'jobs/code/main.r', 'main.r', 'MAIN-CODE')
                        `.execute(trx)
                    }
                },
                async (trx) => {
                    const { rows } = await sql<{ count: string }>`SELECT count(*) FROM study_job_file`.execute(trx)
                    expect(Number(rows[0].count)).toBe(2)
                },
            )
        })
    })
})
