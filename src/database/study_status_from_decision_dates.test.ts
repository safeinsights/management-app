import { db, describe, expect, insertTestStudyOnly, it } from '@/tests/unit.helpers'
import type { Kysely } from 'kysely'
import type { StudyStatus } from '@/database/types'
import { up } from './migrations/1793742918582_study_status_from_decision_dates'

const studyWith = async (status: StudyStatus, dates: { approvedAt?: Date; rejectedAt?: Date }) => {
    const { study } = await insertTestStudyOnly()
    await db
        .updateTable('study')
        .set({ status, approvedAt: dates.approvedAt ?? null, rejectedAt: dates.rejectedAt ?? null })
        .where('id', '=', study.id)
        .execute()
    return study.id
}

describe('study_status_from_decision_dates migration', () => {
    it('stores the decision the removed fallback read from the dates, and leaves every other row alone', async () => {
        const ids = {
            approved: await studyWith('PENDING-REVIEW', { approvedAt: new Date() }),
            rejected: await studyWith('PENDING-REVIEW', { rejectedAt: new Date() }),
            pending: await studyWith('PENDING-REVIEW', {}),
            draft: await studyWith('DRAFT', {}),
            draftWithApproval: await studyWith('DRAFT', { approvedAt: new Date() }),
            archivedApproved: await studyWith('ARCHIVED', { approvedAt: new Date() }),
            archivedRejected: await studyWith('ARCHIVED', { rejectedAt: new Date() }),
            changeRequested: await studyWith('CHANGE-REQUESTED', { approvedAt: new Date() }),
            rejectedWithApproval: await studyWith('REJECTED', { approvedAt: new Date() }),
        }

        await up(db as unknown as Kysely<unknown>)

        const rows = await db
            .selectFrom('study')
            .select(['id', 'status'])
            .where('id', 'in', Object.values(ids))
            .execute()
        const statusOf = (id: string) => rows.find((row) => row.id === id)?.status
        expect(statusOf(ids.approved)).toBe('APPROVED')
        expect(statusOf(ids.rejected)).toBe('REJECTED')
        expect(statusOf(ids.pending)).toBe('PENDING-REVIEW')
        expect(statusOf(ids.draft)).toBe('DRAFT')
        expect(statusOf(ids.draftWithApproval)).toBe('DRAFT')
        expect(statusOf(ids.archivedApproved)).toBe('ARCHIVED')
        expect(statusOf(ids.archivedRejected)).toBe('ARCHIVED')
        expect(statusOf(ids.changeRequested)).toBe('CHANGE-REQUESTED')
        expect(statusOf(ids.rejectedWithApproval)).toBe('REJECTED')
    })
})
