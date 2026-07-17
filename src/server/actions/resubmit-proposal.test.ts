// OTTER-521: DB-backed tests for resubmitProposalAction. Uses the
// studyProposalComment table (migration 1776200000001).
import {
    actionResult,
    buildFeedback,
    db,
    insertTestStudyJobData,
    insertTestUser,
    mockClerkSession,
    mockSessionWithTestData,
} from '@/tests/unit.helpers'
import { describe, expect, it, vi } from 'vitest'
import {
    onUpdateDraftStudyAction,
    resubmitProposalAction,
    saveProposalResubmissionNoteDraftAction,
    startProposalRevisionAction,
} from '@/server/actions/study-request'
import { writeProposalSubmissionSnapshot } from '@/server/db/proposal-snapshot'

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

const NOTE_50_WORDS = buildFeedback(50)

describe('resubmitProposalAction', () => {
    it('transitions a CHANGE-REQUESTED study to PENDING-REVIEW and writes a RESUBMISSION-NOTE comment', async () => {
        const { org, user } = await mockSessionWithTestData({ orgSlug: 'lab-resubmit-1', orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'CHANGE-REQUESTED',
            title: 'Original title',
        })

        const beforeResubmit = await db
            .selectFrom('study')
            .select('lastUpdatedAt')
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()

        actionResult(
            await resubmitProposalAction({
                studyId: study.id,
                studyInfo: { title: 'Updated title' },
                resubmissionNote: NOTE_50_WORDS,
            }),
        )

        const updated = await db
            .selectFrom('study')
            .select(['status', 'title', 'submittedAt', 'lastUpdatedAt'])
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(updated.status).toBe('PENDING-REVIEW')
        expect(updated.title).toBe('Updated title')
        // submittedAt is intentionally NOT bumped on resubmit — the original
        // first-submission timestamp is preserved; the studyProposalComment
        // row carries the resubmission timestamp instead.
        expect(updated.submittedAt).toEqual(study.submittedAt)
        expect(new Date(updated.lastUpdatedAt).getTime()).toBeGreaterThan(
            new Date(beforeResubmit.lastUpdatedAt).getTime(),
        )

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
        expect(JSON.stringify(comments[0].body)).toContain('word1')
    })

    it('writes an immutable proposal snapshot from the resubmitted fields', async () => {
        const { org, user } = await mockSessionWithTestData({ orgSlug: 'lab-resubmit-snap', orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'CHANGE-REQUESTED',
            title: 'Original title',
        })

        actionResult(
            await resubmitProposalAction({
                studyId: study.id,
                studyInfo: { title: 'Resubmitted title' },
                resubmissionNote: NOTE_50_WORDS,
            }),
        )

        const snaps = await db
            .selectFrom('studyProposalSubmission')
            .select(['version', 'snapshot'])
            .where('studyId', '=', study.id)
            .orderBy('version', 'desc')
            .execute()
        expect(snaps.length).toBeGreaterThanOrEqual(1)
        expect((snaps[0].snapshot as { title: string }).title).toBe('Resubmitted title')
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

    it('deletes stale proposal-* yjs_document rows when resubmitting', async () => {
        const { org, user } = await mockSessionWithTestData({ orgSlug: 'lab-resubmit-proposal-yjs', orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'CHANGE-REQUESTED',
        })

        await db
            .insertInto('yjsDocument')
            .values({ name: `proposal-${study.id}-fields`, studyId: study.id, data: Buffer.from([0]) })
            .execute()
        await db
            .insertInto('yjsDocument')
            .values({ name: `proposal-${study.id}-research-questions`, studyId: study.id, data: Buffer.from([0]) })
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
            .where('name', 'like', `proposal-${study.id}-%`)
            .execute()
        expect(remaining).toHaveLength(0)
    })

    it('returns the submitter full name and reviewing org name for the stateless broadcast', async () => {
        const { org, user } = await mockSessionWithTestData({ orgSlug: 'lab-resubmit-meta', orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'CHANGE-REQUESTED',
        })

        const result = actionResult(
            await resubmitProposalAction({
                studyId: study.id,
                studyInfo: { title: 'Resubmitted' },
                resubmissionNote: NOTE_50_WORDS,
            }),
        )

        const reviewerOrg = await db
            .selectFrom('study')
            .innerJoin('org', 'org.id', 'study.orgId')
            .select('org.name as orgName')
            .where('study.id', '=', study.id)
            .executeTakeFirstOrThrow()

        expect(result.submitterFullName).toBe(user.fullName)
        expect(result.submitterClerkId).toBe(user.clerkId)
        expect(result.orgName).toBe(reviewerOrg.orgName)
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

    it('allows any member of the submitting lab to resubmit, not just the original researcher', async () => {
        const { org, user: ownerA } = await mockSessionWithTestData({
            orgSlug: 'lab-resubmit-sameorg',
            orgType: 'lab',
        })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: ownerA.id,
            studyStatus: 'CHANGE-REQUESTED',
            title: 'Original title',
        })

        // a second researcher in the same lab takes over the resubmission
        const { user: teammate } = await insertTestUser({ org })
        mockClerkSession({
            userId: teammate.id,
            clerkUserId: teammate.clerkId,
            email: teammate.email ?? undefined,
            orgSlug: org.slug,
            orgId: org.id,
            orgType: 'lab',
        })

        actionResult(
            await resubmitProposalAction({
                studyId: study.id,
                studyInfo: { title: 'Resubmitted by teammate' },
                resubmissionNote: NOTE_50_WORDS,
            }),
        )

        const updated = await db
            .selectFrom('study')
            .select(['status', 'title', 'researcherId'])
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(updated.status).toBe('PENDING-REVIEW')
        expect(updated.title).toBe('Resubmitted by teammate')
        // owner is preserved: researcherId stays the original creator
        expect(updated.researcherId).toBe(ownerA.id)

        const comment = await db
            .selectFrom('studyProposalComment')
            .select(['authorId', 'entryType'])
            .where('studyId', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(comment.entryType).toBe('RESUBMISSION-NOTE')
        // the note is attributed to whoever actually resubmitted, not the owner
        expect(comment.authorId).toBe(teammate.id)
    })

    it('blocks further edits and a second resubmission once any member has resubmitted', async () => {
        const { org, user: ownerA } = await mockSessionWithTestData({
            orgSlug: 'lab-resubmit-sequential',
            orgType: 'lab',
        })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: ownerA.id,
            studyStatus: 'CHANGE-REQUESTED',
            title: 'Original title',
        })

        const loginAs = (user: { id: string; clerkId: string; email: string | null }) =>
            mockClerkSession({
                userId: user.id,
                clerkUserId: user.clerkId,
                email: user.email ?? undefined,
                orgSlug: org.slug,
                orgId: org.id,
                orgType: 'lab',
            })

        // teammate B resubmits first
        const { user: teammateB } = await insertTestUser({ org })
        loginAs(teammateB)
        actionResult(
            await resubmitProposalAction({
                studyId: study.id,
                studyInfo: { title: 'Resubmitted by B' },
                resubmissionNote: NOTE_50_WORDS,
            }),
        )

        // a third member C now finds the study already submitted (PENDING-REVIEW)
        const { user: teammateC } = await insertTestUser({ org })
        loginAs(teammateC)

        // editing is no longer allowed (status flipped to PENDING-REVIEW)
        const editResult = await onUpdateDraftStudyAction({
            studyId: study.id,
            studyInfo: { title: 'Late edit by C' },
        })
        expect('error' in editResult).toBe(true)

        // and a second resubmission is rejected
        const resubmitResult = await resubmitProposalAction({
            studyId: study.id,
            studyInfo: { title: 'Second resubmit by C' },
            resubmissionNote: NOTE_50_WORDS,
        })
        expect('error' in resubmitResult).toBe(true)

        // the study reflects only B's resubmission, and exactly one note was recorded
        const after = await db
            .selectFrom('study')
            .select(['status', 'title'])
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(after.status).toBe('PENDING-REVIEW')
        expect(after.title).toBe('Resubmitted by B')

        const noteCount = await db
            .selectFrom('studyProposalComment')
            .select((eb) => eb.fn.count('id').as('count'))
            .where('studyId', '=', study.id)
            .where('entryType', '=', 'RESUBMISSION-NOTE')
            .executeTakeFirstOrThrow()
        expect(Number(noteCount.count)).toBe(1)
    })
})

// OTTER-636: the first real edit to a change-requested proposal flips it to a literal revision DRAFT
// that points at the immutable snapshot being revised.
describe('startProposalRevisionAction', () => {
    it('flips a CHANGE-REQUESTED study to DRAFT and points at the latest submitted snapshot', async () => {
        const { org, user } = await mockSessionWithTestData({ orgSlug: 'lab-start-rev-1', orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'CHANGE-REQUESTED',
            title: 'Original title',
        })
        await writeProposalSubmissionSnapshot(db, study.id, user.id)
        const snap = await db
            .selectFrom('studyProposalSubmission')
            .select('id')
            .where('studyId', '=', study.id)
            .orderBy('version', 'desc')
            .executeTakeFirstOrThrow()

        actionResult(await startProposalRevisionAction({ studyId: study.id }))

        const after = await db
            .selectFrom('study')
            .select(['status', 'proposalRevisionBaseSubmissionId'])
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(after.status).toBe('DRAFT')
        expect(after.proposalRevisionBaseSubmissionId).toBe(snap.id)
    })

    it('is idempotent for a study whose revision has already started', async () => {
        const { org, user } = await mockSessionWithTestData({ orgSlug: 'lab-start-rev-idem', orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'CHANGE-REQUESTED',
        })
        await writeProposalSubmissionSnapshot(db, study.id, user.id)

        actionResult(await startProposalRevisionAction({ studyId: study.id }))
        const first = await db
            .selectFrom('study')
            .select(['status', 'proposalRevisionBaseSubmissionId'])
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()

        // second call must not throw or change the base
        actionResult(await startProposalRevisionAction({ studyId: study.id }))
        const second = await db
            .selectFrom('study')
            .select(['status', 'proposalRevisionBaseSubmissionId'])
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()

        expect(second.status).toBe('DRAFT')
        expect(second.proposalRevisionBaseSubmissionId).toBe(first.proposalRevisionBaseSubmissionId)
    })

    // A change-requested study with no submitted snapshot (e.g. seeded directly, or a legacy row the
    // backfill missed) cannot become a revision draft — but must not fail the researcher's edit. It
    // stays CHANGE-REQUESTED, from which resubmit works directly.
    it('is a graceful no-op when the study has no submitted snapshot', async () => {
        const { org, user } = await mockSessionWithTestData({ orgSlug: 'lab-start-rev-nosnap', orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'CHANGE-REQUESTED',
        })

        actionResult(await startProposalRevisionAction({ studyId: study.id }))

        const after = await db
            .selectFrom('study')
            .select(['status', 'proposalRevisionBaseSubmissionId'])
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(after.status).toBe('CHANGE-REQUESTED')
        expect(after.proposalRevisionBaseSubmissionId).toBeNull()
    })

    it('is a no-op for a study that is not CHANGE-REQUESTED', async () => {
        const { org, user } = await mockSessionWithTestData({ orgSlug: 'lab-start-rev-noop', orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'PENDING-REVIEW',
        })

        actionResult(await startProposalRevisionAction({ studyId: study.id }))

        const after = await db
            .selectFrom('study')
            .select(['status', 'proposalRevisionBaseSubmissionId'])
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(after.status).toBe('PENDING-REVIEW')
        expect(after.proposalRevisionBaseSubmissionId).toBeNull()
    })

    it('rejects a caller from a different lab', async () => {
        const { org: labA, user: ownerA } = await mockSessionWithTestData({
            orgSlug: 'lab-start-rev-A',
            orgType: 'lab',
        })
        const { study } = await insertTestStudyJobData({
            org: labA,
            researcherId: ownerA.id,
            studyStatus: 'CHANGE-REQUESTED',
        })
        await writeProposalSubmissionSnapshot(db, study.id, ownerA.id)

        await mockSessionWithTestData({ orgSlug: 'lab-start-rev-B', orgType: 'lab' })
        const result = await startProposalRevisionAction({ studyId: study.id })
        expect('error' in result).toBe(true)

        const unchanged = await db
            .selectFrom('study')
            .select('status')
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(unchanged.status).toBe('CHANGE-REQUESTED')
    })

    it('lets resubmitProposalAction finalize a revision draft and clear the base', async () => {
        const { org, user } = await mockSessionWithTestData({ orgSlug: 'lab-start-rev-resub', orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'CHANGE-REQUESTED',
            title: 'Original title',
        })
        await writeProposalSubmissionSnapshot(db, study.id, user.id)

        actionResult(await startProposalRevisionAction({ studyId: study.id }))

        actionResult(
            await resubmitProposalAction({
                studyId: study.id,
                studyInfo: { title: 'Revised title' },
                resubmissionNote: NOTE_50_WORDS,
            }),
        )

        const after = await db
            .selectFrom('study')
            .select(['status', 'title', 'proposalRevisionBaseSubmissionId'])
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(after.status).toBe('PENDING-REVIEW')
        expect(after.title).toBe('Revised title')
        expect(after.proposalRevisionBaseSubmissionId).toBeNull()
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
            await onUpdateDraftStudyAction({
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

        const result = await onUpdateDraftStudyAction({
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

    it('rejects payloads larger than 100kb', async () => {
        const { org, user } = await mockSessionWithTestData({ orgSlug: 'lab-prop-note-3', orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'CHANGE-REQUESTED',
        })

        // The draft is serialized Lexical JSON since OTTER-658, so the schema bound is
        // 100_000 chars; a legitimate heavily-formatted note can exceed the old 10kb limit.
        const tooLong = 'x'.repeat(100_001)
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
