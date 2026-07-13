import { readdirSync } from 'fs'
import path from 'path'
import type { Kysely } from 'kysely'
import { describe, expect, it } from 'vitest'
import { db, sql } from '@/database'
import { up as dedupeStudyJobFiles } from '@/database/migrations/1780400000000_dedupe_and_unique_study_job_file_path'

describe('migrations', () => {
    it('has no duplicate timestamps', () => {
        const files = readdirSync(path.join(__dirname, 'migrations')).filter((f) => f.endsWith('.ts'))
        const timestamps = files.map((f) => f.split('_')[0])
        const dupes = timestamps.filter((t, i) => timestamps.indexOf(t) !== i)
        expect(dupes, `Duplicate migration timestamps: ${dupes.join(', ')}`).toEqual([])
    })

    it('preserves recipient keys spread across duplicate study job files', async () => {
        await sql`
            CREATE TEMP TABLE study_job_file (
                id uuid PRIMARY KEY,
                study_job_id uuid NOT NULL,
                path text NOT NULL,
                created_at timestamptz NOT NULL
            ) ON COMMIT DROP
        `.execute(db)
        await sql`
            CREATE TEMP TABLE study_job_file_recipient_key (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                study_job_file_id uuid NOT NULL REFERENCES study_job_file(id) ON DELETE CASCADE,
                file_path text NOT NULL,
                fingerprint text NOT NULL,
                crypt text NOT NULL,
                created_at timestamptz NOT NULL DEFAULT now(),
                UNIQUE (study_job_file_id, file_path, fingerprint)
            ) ON COMMIT DROP
        `.execute(db)

        const jobId = '00000000-0000-0000-0000-000000000001'
        const firstFileId = '00000000-0000-0000-0000-000000000002'
        const secondFileId = '00000000-0000-0000-0000-000000000003'
        await sql`
            INSERT INTO study_job_file (id, study_job_id, path, created_at)
            VALUES
                (${firstFileId}, ${jobId}, 'results.zip', '2026-01-01T00:00:00Z'),
                (${secondFileId}, ${jobId}, 'results.zip', '2026-01-02T00:00:00Z')
        `.execute(db)
        await sql`
            INSERT INTO study_job_file_recipient_key
                (study_job_file_id, file_path, fingerprint, crypt)
            VALUES
                (${firstFileId}, 'first.csv', 'fingerprint-a', 'crypt-a'),
                (${firstFileId}, 'shared.csv', 'fingerprint-shared', 'crypt-shared'),
                (${secondFileId}, 'second.csv', 'fingerprint-b', 'crypt-b'),
                (${secondFileId}, 'shared.csv', 'fingerprint-shared', 'crypt-shared')
        `.execute(db)

        await dedupeStudyJobFiles(db as unknown as Kysely<unknown>)

        const files = await sql<{ id: string }>`SELECT id FROM study_job_file`.execute(db)
        expect(files.rows).toEqual([{ id: firstFileId }])

        const keys = await sql<{ studyJobFileId: string; filePath: string; fingerprint: string }>`
            SELECT study_job_file_id, file_path, fingerprint
            FROM study_job_file_recipient_key
            ORDER BY file_path
        `.execute(db)
        expect(keys.rows).toEqual([
            { studyJobFileId: firstFileId, filePath: 'first.csv', fingerprint: 'fingerprint-a' },
            { studyJobFileId: firstFileId, filePath: 'second.csv', fingerprint: 'fingerprint-b' },
            { studyJobFileId: firstFileId, filePath: 'shared.csv', fingerprint: 'fingerprint-shared' },
        ])
    })
})
