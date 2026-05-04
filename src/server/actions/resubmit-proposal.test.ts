// OTTER-521: DB-backed tests for resubmitProposalAction and
// onUpdateClarifiedProposalAction. Uses the studyProposalComment table that
// already exists on main (migration 1776200000001).
import { actionResult, db, insertTestStudyJobData, mockSessionWithTestData } from '@/tests/unit.helpers'
import { describe, expect, it, vi } from 'vitest'
import { onUpdateClarifiedProposalAction, resubmitProposalAction } from '@/server/actions/study-request'

vi.mock('@/server/aws', async () => {
    const actual = await vi.importActual('@/server/aws')
    return {
        ...actual,
        createSignedUploadUrl: vi.fn().mockResolvedValue('test-signed-url'),
        deleteFolderContents: vi.fn(),
        storeS3File: vi.fn(),
        triggerScanForStudyJob: vi.fn(),
    }
})

const NOTE_50_WORDS = Array.from({ length: 50 }, (_, i) => `word${i}`).join(' ')

describe('resubmitProposalAction', () => {
    it('transitions a CHANGE-REQUESTED study to PENDING-REVIEW and writes a RESUBMISSION-NOTE comment', async () => {
        const { org, user } = await mockSessionWithTestData({ orgSlug: 'lab-resubmit-1', orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'CHANGE-REQUESTED',
            title: 'Original title',
        })

        actionResult(
            await resubmitProposalAction({
                studyId: study.id,
                studyInfo: { title: 'Updated title' },
                resubmissionNote: NOTE_50_WORDS,
            }),
        )

        const updated = await db
            .selectFrom('study')
            .select(['status', 'title', 'submittedAt'])
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(updated.status).toBe('PENDING-REVIEW')
        expect(updated.title).toBe('Updated title')
        expect(updated.submittedAt).not.toBeNull()

        const comments = await db
            .selectFrom('studyProposalComment')
            .select(['authorRole', 'entryType', 'authorId', 'body'])
            .where('studyId', '=', study.id)
            .execute()

        expect(comments).toHaveLength(1)
        expect(comments[0]).toEqual(
            expect.objectContaining({
                authorRole: 'RESEARCHER',
                entryType: 'RESUBMISSION-NOTE',
                authorId: user.id,
            }),
        )
        // body is stored as Lexical JSON; the note words should round-trip
        expect(JSON.stringify(comments[0].body)).toContain('word0')
    })

    it('rejects resubmission when study is not CHANGE-REQUESTED', async () => {
        const { org, user } = await mockSessionWithTestData({ orgSlug: 'lab-resubmit-2', orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'APPROVED',
        })

        const result = await resubmitProposalAction({
            studyId: study.id,
            studyInfo: { title: 'attempting' },
            resubmissionNote: NOTE_50_WORDS,
        })

        expect('error' in result).toBe(true)

        const unchanged = await db
            .selectFrom('study')
            .select('status')
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(unchanged.status).toBe('APPROVED')

        const commentCount = await db
            .selectFrom('studyProposalComment')
            .select((eb) => eb.fn.count('id').as('count'))
            .where('studyId', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(Number(commentCount.count)).toBe(0)
    })
})

describe('onUpdateClarifiedProposalAction', () => {
    it('saves draft edits to a CHANGE-REQUESTED study without changing status', async () => {
        const { org, user } = await mockSessionWithTestData({ orgSlug: 'lab-resubmit-3', orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'CHANGE-REQUESTED',
            title: 'Original',
        })

        actionResult(
            await onUpdateClarifiedProposalAction({
                studyId: study.id,
                studyInfo: { title: 'Edited' },
            }),
        )

        const after = await db
            .selectFrom('study')
            .select(['title', 'status'])
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(after.title).toBe('Edited')
        expect(after.status).toBe('CHANGE-REQUESTED')
    })

    it('does not modify a study that is not in CHANGE-REQUESTED status', async () => {
        const { org, user } = await mockSessionWithTestData({ orgSlug: 'lab-resubmit-4', orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'PENDING-REVIEW',
            title: 'Original',
        })

        actionResult(
            await onUpdateClarifiedProposalAction({
                studyId: study.id,
                studyInfo: { title: 'Should-not-apply' },
            }),
        )

        const after = await db.selectFrom('study').select('title').where('id', '=', study.id).executeTakeFirstOrThrow()
        expect(after.title).toBe('Original')
    })
})
