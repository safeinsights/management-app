import { db, describe, expect, insertTestStudyOnly, it } from '@/tests/unit.helpers'
import type { Kysely } from 'kysely'
import { up } from './migrations/1780300000000_backfill_code_phase_study_status'

describe('backfill_code_phase_study_status migration', () => {
    it('restores APPROVED for code-phase stragglers and leaves proposal-stage rows alone', async () => {
        const { study: straggler } = await insertTestStudyOnly()
        await db
            .updateTable('study')
            .set({ status: 'PENDING-REVIEW', approvedAt: new Date() })
            .where('id', '=', straggler.id)
            .execute()

        const { study: proposalStage } = await insertTestStudyOnly()
        await db
            .updateTable('study')
            .set({ status: 'PENDING-REVIEW', approvedAt: null })
            .where('id', '=', proposalStage.id)
            .execute()

        await up(db as unknown as Kysely<unknown>)

        const rows = await db
            .selectFrom('study')
            .select(['id', 'status'])
            .where('id', 'in', [straggler.id, proposalStage.id])
            .execute()

        expect(rows.find((r) => r.id === straggler.id)?.status).toBe('APPROVED')
        expect(rows.find((r) => r.id === proposalStage.id)?.status).toBe('PENDING-REVIEW')
    })
})
