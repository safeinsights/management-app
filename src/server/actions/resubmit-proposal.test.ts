// OTTER-521: DB-backed tests for resubmitProposalAction and
// onUpdateClarifiedProposalAction. Uses the studyProposalComment table that
// already exists on main (migration 1776200000001).
import { actionResult, db, insertTestStudyJobData, insertTestUser, mockSessionWithTestData } from '@/tests/unit.helpers'
import { describe, expect, it, vi } from 'vitest'
import {
    onUpdateClarifiedProposalAction,
    resubmitProposalAction,
    saveProposalResubmissionNoteDraftAction,
} from '@/server/actions/study-request'

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
        // submittedAt is intentionally NOT bumped on resubmit — the original
        // first-submission timestamp is preserved; the studyProposalComment
        // row carries the resubmission timestamp instead.
        expect(updated.submittedAt).toEqual(study.submittedAt)

        const comments = await db
            .selectFrom('studyProposalComment')
            .select(['authorRole', 'entryType', 'authorId', 'body', 'version'])
            .where('studyId', '=', study.id)
            .execute()

        expect(comments).toHaveLength(1)
        expect(comments[0]).toEqual(
            expect.objectContaining({
                authorRole: 'RESEARCHER',
                entryType: 'RESUBMISSION-NOTE',
                authorId: user.id,
                version: 2,
            }),
        )
        // body is stored as Lexical JSON; the note words should round-trip
        expect(JSON.stringify(comments[0].body)).toContain('word0')
    })

    it('deletes stale review-feedback yjs_document rows when resubmitting', async () => {
        const { org, user } = await mockSessionWithTestData({ orgSlug: 'lab-resubmit-yjs', orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'CHANGE-REQUESTED',
        })

        await db
            .insertInto('yjsDocument')
            .values({ name: `review-feedback-${study.id}-v1`, studyId: study.id, data: Buffer.from([0]) })
            .execute()
        await db
            .insertInto('yjsDocument')
            .values({ name: `review-feedback-${study.id}-v2`, studyId: study.id, data: Buffer.from([0]) })
            .execute()

        actionResult(
            await resubmitProposalAction({
                studyId: study.id,
                studyInfo: { title: 'Resubmitted' },
                resubmissionNote: NOTE_50_WORDS,
            }),
        )

        const remaining = await db
            .selectFrom('yjsDocument')
            .select('name')
            .where('studyId', '=', study.id)
            .where('name', 'like', `review-feedback-${study.id}%`)
            .execute()
        expect(remaining).toHaveLength(0)
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

    it('rejects when caller is not a member of the submitting lab', async () => {
        // study belongs to lab A
        const { org: labA, user: ownerA } = await mockSessionWithTestData({ orgSlug: 'lab-A', orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org: labA,
            researcherId: ownerA.id,
            studyStatus: 'CHANGE-REQUESTED',
            title: 'Other lab study',
        })

        // a different user from lab B logs in and tries to resubmit it
        await mockSessionWithTestData({ orgSlug: 'lab-B', orgType: 'lab' })

        const result = await resubmitProposalAction({
            studyId: study.id,
            studyInfo: { title: 'Hijack attempt' },
            resubmissionNote: NOTE_50_WORDS,
        })

        expect('error' in result).toBe(true)

        const unchanged = await db
            .selectFrom('study')
            .select(['title', 'status'])
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(unchanged.title).toBe('Other lab study')
        expect(unchanged.status).toBe('CHANGE-REQUESTED')
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

    it('rejects edits to a study that is not in CHANGE-REQUESTED status', async () => {
        const { org, user } = await mockSessionWithTestData({ orgSlug: 'lab-resubmit-4', orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'PENDING-REVIEW',
            title: 'Original',
        })

        const result = await onUpdateClarifiedProposalAction({
            studyId: study.id,
            studyInfo: { title: 'Should-not-apply' },
        })
        expect('error' in result).toBe(true)

        const after = await db.selectFrom('study').select('title').where('id', '=', study.id).executeTakeFirstOrThrow()
        expect(after.title).toBe('Original')
    })
})

// Any researcher in the submitting lab — not just the study's original
// researcher — must be able to edit and resubmit a CHANGE-REQUESTED proposal.
describe('lab co-author edit & resubmit', () => {
    it('lets a different researcher in the same lab save draft edits', async () => {
        const { org } = await mockSessionWithTestData({ orgSlug: 'lab-coauthor-draft', orgType: 'lab' })
        // original author of the study
        const { user: originalAuthor } = await insertTestUser({ org })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: originalAuthor.id,
            studyStatus: 'CHANGE-REQUESTED',
            title: 'Original',
        })

        // Caller is the lab member from mockSessionWithTestData — a different
        // researcher than the study owner.
        actionResult(
            await onUpdateClarifiedProposalAction({
                studyId: study.id,
                studyInfo: { title: 'Co-author edited' },
            }),
        )

        const after = await db
            .selectFrom('study')
            .select(['title', 'researcherId'])
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(after.title).toBe('Co-author edited')
        // researcherId should remain the original author; edits are credited to
        // the lab, not the saving user.
        expect(after.researcherId).toBe(originalAuthor.id)
    })

    it('lets a different researcher in the same lab resubmit the proposal', async () => {
        const { org } = await mockSessionWithTestData({ orgSlug: 'lab-coauthor-resub', orgType: 'lab' })
        const { user: originalAuthor } = await insertTestUser({ org })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: originalAuthor.id,
            studyStatus: 'CHANGE-REQUESTED',
            title: 'Original',
        })

        const NOTE_50_WORDS = Array.from({ length: 50 }, (_, i) => `word${i}`).join(' ')

        actionResult(
            await resubmitProposalAction({
                studyId: study.id,
                studyInfo: { title: 'Resubmitted by co-author' },
                resubmissionNote: NOTE_50_WORDS,
            }),
        )

        const updated = await db
            .selectFrom('study')
            .select(['status', 'title'])
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(updated.status).toBe('PENDING-REVIEW')
        expect(updated.title).toBe('Resubmitted by co-author')
    })

    it('still rejects callers from a different lab', async () => {
        // Study is owned by lab-cross-author-A
        const { org: labA, user: ownerA } = await mockSessionWithTestData({
            orgSlug: 'lab-cross-author-A',
            orgType: 'lab',
        })
        const { study } = await insertTestStudyJobData({
            org: labA,
            researcherId: ownerA.id,
            studyStatus: 'CHANGE-REQUESTED',
            title: 'Lab A study',
        })

        // Switch session to a user in lab-cross-author-B
        await mockSessionWithTestData({ orgSlug: 'lab-cross-author-B', orgType: 'lab' })

        const result = await onUpdateClarifiedProposalAction({
            studyId: study.id,
            studyInfo: { title: 'Cross-lab hijack' },
        })
        // Cross-lab attempt now fails loudly via the 0-row UPDATE check;
        // without that the client would render the action as success while
        // the row was never touched.
        expect('error' in result).toBe(true)
        const unchanged = await db
            .selectFrom('study')
            .select('title')
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(unchanged.title).toBe('Lab A study')
    })
})

describe('saveProposalResubmissionNoteDraftAction', () => {
    it('persists the draft note on the study row', async () => {
        const { org, user } = await mockSessionWithTestData({ orgSlug: 'lab-prop-note-1', orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'CHANGE-REQUESTED',
        })

        const result = actionResult(
            await saveProposalResubmissionNoteDraftAction({ studyId: study.id, note: 'In-progress note' }),
        )
        expect(result.studyId).toBe(study.id)

        const row = await db
            .selectFrom('study')
            .select('proposalResubmissionNoteDraft')
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(row.proposalResubmissionNoteDraft).toBe('In-progress note')
    })

    it('lets a lab co-author overwrite the draft (last-write-wins)', async () => {
        const { org } = await mockSessionWithTestData({ orgSlug: 'lab-prop-note-2', orgType: 'lab' })
        const { user: originalAuthor } = await insertTestUser({ org })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: originalAuthor.id,
            studyStatus: 'CHANGE-REQUESTED',
        })

        actionResult(await saveProposalResubmissionNoteDraftAction({ studyId: study.id, note: 'co-author note' }))

        const row = await db
            .selectFrom('study')
            .select('proposalResubmissionNoteDraft')
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(row.proposalResubmissionNoteDraft).toBe('co-author note')
    })

    it('rejects payloads larger than 10kb', async () => {
        const { org, user } = await mockSessionWithTestData({ orgSlug: 'lab-prop-note-3', orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'CHANGE-REQUESTED',
        })

        const tooLong = 'x'.repeat(10_001)
        const result = await saveProposalResubmissionNoteDraftAction({ studyId: study.id, note: tooLong })
        expect(result).toHaveProperty('error')
    })

    it('rejects a cross-lab save attempt instead of silently no-op', async () => {
        const { org: labA, user: ownerA } = await mockSessionWithTestData({
            orgSlug: 'lab-prop-note-cross-A',
            orgType: 'lab',
        })
        const { study } = await insertTestStudyJobData({
            org: labA,
            researcherId: ownerA.id,
            studyStatus: 'CHANGE-REQUESTED',
        })

        // Switch session to a user in a different lab and try to save
        await mockSessionWithTestData({ orgSlug: 'lab-prop-note-cross-B', orgType: 'lab' })
        const result = await saveProposalResubmissionNoteDraftAction({
            studyId: study.id,
            note: 'cross-lab attempt',
        })
        // Without the 0-row UPDATE check the client would show "All changes
        // saved" while the note was never persisted.
        expect('error' in result).toBe(true)

        const row = await db
            .selectFrom('study')
            .select('proposalResubmissionNoteDraft')
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(row.proposalResubmissionNoteDraft).toBeNull()
    })

    it('rejects a save attempt when the study is not CHANGE-REQUESTED', async () => {
        const { org, user } = await mockSessionWithTestData({ orgSlug: 'lab-prop-note-wrong-status', orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'PENDING-REVIEW',
        })

        const result = await saveProposalResubmissionNoteDraftAction({
            studyId: study.id,
            note: 'wrong-status attempt',
        })
        expect('error' in result).toBe(true)
    })

    it('clears the draft when the proposal is resubmitted', async () => {
        const { org, user } = await mockSessionWithTestData({ orgSlug: 'lab-prop-note-clear', orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'CHANGE-REQUESTED',
        })
        // Seed an in-progress draft note
        actionResult(await saveProposalResubmissionNoteDraftAction({ studyId: study.id, note: 'will-be-cleared' }))

        const NOTE_50_WORDS = Array.from({ length: 50 }, (_, i) => `word${i}`).join(' ')
        actionResult(
            await resubmitProposalAction({
                studyId: study.id,
                studyInfo: { title: 'Resubmitted' },
                resubmissionNote: NOTE_50_WORDS,
            }),
        )

        const row = await db
            .selectFrom('study')
            .select('proposalResubmissionNoteDraft')
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(row.proposalResubmissionNoteDraft).toBeNull()
    })
})
