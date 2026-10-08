import logger from '@/lib/logger'
import { CLERK_ADMIN_ORG_SLUG } from '@/lib/types'
import { deliver } from '@/server/mailgun'
import {
    BLANK_UUID,
    actionResult,
    buildFeedback,
    createTestProposalDraft,
    db,
    getAuditEntries,
    insertTestOrg,
    insertTestCodeResubmissionNote,
    insertTestStudyData,
    insertTestStudyJobData,
    insertTestStudyOnly,
    seedAcknowledgedStudyAgreement,
    insertTestUser,
    mockClerkSession,
    mockSessionWithTestData,
    flushDeferred,
    postHogCaptures,
    setTestStudyStatus,
    waitFor,
} from '@/tests/unit.helpers'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { StudyJobStatus } from '@/database/types'
import { latestJobForStudy } from '../db/queries'
import {
    ackAgreementsAction,
    fetchStudiesForCurrentResearcherUserAction,
    fetchStudiesForCurrentReviewerAction,
    fetchStudiesForOrgAction,
    getCodeReviewFeedbackAction,
    getOutputsDecisionFeedbackAction,
    getStudyAction,
    softDeleteStudyAction,
    submitCodeReviewDecisionAction,
    submitProposalReviewAction,
} from './study.actions'
import { finalizeStudySubmissionAction, resubmitProposalAction } from './study-request'
import { purgeReviewFeedbackYjsDocBeforeAt } from '@/server/db/yjs-cleanup'
import { lexicalJson } from '@/lib/lexical'
import { REVIEW_FEEDBACK_FIELD_TITLE, REVIEW_FEEDBACK_MAX_CHARACTERS } from '@/lib/proposal-review'
import { overCharacterLimitError } from '@/lib/field-limits'
import { proposalFieldsDocName } from '@/lib/collaboration-documents'
import { projectStudyState } from '@/lib/study-screen'
import { dashboardRawStateFromRow } from '@/components/dashboard/studies-table/dashboard-raw-state'

// Spread the real module: mailer reads SI_EMAIL from it, and a bare `deliver` mock makes that throw.
vi.mock('@/server/mailgun', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/server/mailgun')>()),
    deliver: vi.fn(),
}))

const deliverMock = deliver as unknown as Mock

describe('Study Actions', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    const approveProposal = (studyId: string, orgSlug: string) =>
        submitProposalReviewAction({
            studyId,
            orgSlug,
            decision: 'approve',
            feedback: buildFeedback(60),
            reviewVersion: 1,
        })

    const insertSiAdmin = async () => {
        const siOrg = await insertTestOrg({ slug: CLERK_ADMIN_ORG_SLUG, type: 'enclave' })
        const { user } = await insertTestUser({
            org: { id: siOrg.id, slug: siOrg.slug, type: 'enclave' },
            isAdmin: true,
        })
        return user
    }

    // SHRMP-328 moved this email to submission. Approval is where it used to fire, so it is the one
    // place worth proving it no longer does.
    it('approving a proposal no longer asks SafeInsights to prepare the Study Agreement', async () => {
        await insertSiAdmin()
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
        // No agreement: with the fixture's own, the email would be skipped for the wrong reason.
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'PENDING-REVIEW',
            withStudyAgreement: false,
        })

        await approveProposal(study.id, org.slug)

        // The approval email proves the deferred work ran, so the absent one is absent by choice.
        await waitFor(() => {
            expect(deliverMock).toHaveBeenCalledWith(
                expect.objectContaining({ template: 'vb - research proposal approved' }),
            )
        })
        expect(deliverMock).not.toHaveBeenCalledWith(expect.objectContaining({ template: 'vb - sla notice' }))
    })

    it('does not approve a study proposal twice', async () => {
        const { user, org } = await mockSessionWithTestData()
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, studyStatus: 'PENDING-REVIEW' })

        await Promise.all([approveProposal(study.id, org.slug), approveProposal(study.id, org.slug)])

        await waitFor(async () => {
            const auditEntries = await getAuditEntries(study.id, 'STUDY')
            expect(auditEntries.filter((entry) => entry.eventType === 'APPROVED')).toHaveLength(1)
        })

        await waitFor(() => {
            expect(
                deliverMock.mock.calls.filter(
                    ([message]) =>
                        message &&
                        typeof message === 'object' &&
                        (message as { template?: string }).template === 'vb - research proposal approved',
                ),
            ).toHaveLength(1)
        })
    })

    it('getStudyAction returns any study that belongs to an org that user is a member of', async () => {
        const { user, org } = await mockSessionWithTestData()
        const { studyId } = await insertTestStudyData({ org, researcherId: user.id })

        await expect(getStudyAction({ studyId })).resolves.toMatchObject({
            id: studyId,
        })
    })

    it('getStudyAction throws for a user in a different org', async () => {
        const { org } = await mockSessionWithTestData()
        const { studyId } = await insertTestStudyData({ org })

        const otherOrg = await insertTestOrg()
        const { user: otherUser } = await insertTestUser({ org: otherOrg })
        mockClerkSession({
            clerkUserId: otherUser.clerkId,
            orgSlug: otherOrg.slug,
            userId: otherUser.id,
            orgId: otherOrg.id,
        })
        vi.spyOn(logger, 'error').mockImplementation(() => undefined)
        const result = await getStudyAction({ studyId })
        expect(result).toEqual({ error: expect.objectContaining({ permission_denied: expect.any(String) }) })
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('cannot view Study'))
    })

    describe('proposal-only studies (no job)', () => {
        async function insertProposalOnlyStudy(org: { id: string }, researcherId: string) {
            return db
                .insertInto('study')
                .values({
                    orgId: org.id,
                    submittedByOrgId: org.id,
                    containerLocation: 'test-container',
                    title: 'proposal-only study',
                    researcherId,
                    piName: 'test',
                    status: 'PENDING-REVIEW',
                    dataSources: ['all'],
                    outputMimeType: 'application/zip',
                    language: 'R',
                })
                .returningAll()
                .executeTakeFirstOrThrow()
        }

        it('approves a proposal-only study without crashing', async () => {
            const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
            const study = await insertProposalOnlyStudy(org, user.id)

            actionResult(await approveProposal(study.id, org.slug))

            const updatedStudy = await db
                .selectFrom('study')
                .select(['status', 'approvedAt', 'rejectedAt', 'reviewerId'])
                .where('id', '=', study.id)
                .executeTakeFirstOrThrow()
            expect(updatedStudy.status).toBe('APPROVED')
            expect(updatedStudy.approvedAt).toBeTruthy()
            expect(updatedStudy.rejectedAt).toBeNull()
            expect(updatedStudy.reviewerId).toBe(user.id)

            await waitFor(async () => {
                expect(await getAuditEntries(study.id, 'STUDY')).toContainEqual({
                    eventType: 'APPROVED',
                    recordType: 'STUDY',
                    recordId: study.id,
                    userId: user.id,
                })
            })

            await waitFor(() => {
                expect(deliverMock).toHaveBeenCalledWith(
                    expect.objectContaining({
                        to: user.email,
                        template: 'vb - research proposal approved',
                    }),
                )
            })

            const jobStatusChanges = await db
                .selectFrom('jobStatusChange')
                .innerJoin('studyJob', 'studyJob.id', 'jobStatusChange.studyJobId')
                .where('studyJob.studyId', '=', study.id)
                .select('jobStatusChange.id')
                .execute()
            expect(jobStatusChanges).toHaveLength(0)
        })
    })

    it('fetchStudiesForOrgAction requires user to be a researcher', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })

        const otherOrg = await insertTestOrg()
        const { user: otherUser } = await insertTestUser({ org: otherOrg })

        const { studyId } = await insertTestStudyData({ org, researcherId: user.id })

        await expect(fetchStudiesForOrgAction({ orgSlug: org.slug })).resolves.toEqual(
            expect.arrayContaining([expect.objectContaining({ id: studyId })]),
        )

        mockClerkSession({ clerkUserId: otherUser.clerkId, orgSlug: otherOrg.slug, userId: otherUser.id })
        await expect(fetchStudiesForOrgAction({ orgSlug: org.slug })).resolves.toMatchObject({
            error: expect.objectContaining({ permission_denied: expect.any(String) }),
        })
    })

    // The reviewer's personal dashboard builds its status tooltips from the submitting lab's name,
    // which this query has to carry: the org dashboards get it from their own joins (OTTER-698).
    it('fetchStudiesForCurrentReviewerAction names the submitting lab on each row', async () => {
        const { org: enclave, user: reviewer } = await mockSessionWithTestData({ orgType: 'enclave' })
        const lab = await insertTestOrg({ slug: 'reviewer-dashboard-lab', type: 'lab', name: 'Genius Lab' })
        const { user: researcher } = await insertTestUser({ org: lab })
        const { studyId } = await insertTestStudyData({ org: enclave, researcherId: researcher.id })
        await db
            .updateTable('study')
            .set({ submittedByOrgId: lab.id, reviewerId: reviewer.id })
            .where('id', '=', studyId)
            .execute()

        const rows = actionResult(await fetchStudiesForCurrentReviewerAction())

        expect(rows).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: studyId,
                    submittingLabName: 'Genius Lab',
                    submittedByOrgSlug: lab.slug,
                }),
            ]),
        )
    })

    describe('fetchStudiesForOrgAction lab-branch visibility (OTTER-497)', () => {
        it('lab teammate sees a DRAFT created by another teammate', async () => {
            const { lab, studyId } = await createTestProposalDraft({
                enclaveSlug: 'fetch-lab-draft-enclave',
                studyInfo: { title: 'Teammate DRAFT' },
            })

            await mockSessionWithTestData({ orgSlug: lab.slug, orgType: 'lab' })
            const result = await fetchStudiesForOrgAction({ orgSlug: lab.slug })

            expect(Array.isArray(result)).toBe(true)
            expect(result).toEqual(expect.arrayContaining([expect.objectContaining({ id: studyId, status: 'DRAFT' })]))
        })

        it('lab teammate sees a CHANGE-REQUESTED study from another teammate', async () => {
            const { lab, studyId } = await createTestProposalDraft({
                enclaveSlug: 'fetch-lab-changereq-enclave',
                studyInfo: { title: 'Teammate CHANGE-REQUESTED' },
            })
            await setTestStudyStatus(studyId, 'CHANGE-REQUESTED')

            await mockSessionWithTestData({ orgSlug: lab.slug, orgType: 'lab' })
            const result = await fetchStudiesForOrgAction({ orgSlug: lab.slug })

            expect(Array.isArray(result)).toBe(true)
            expect(result).toEqual(
                expect.arrayContaining([expect.objectContaining({ id: studyId, status: 'CHANGE-REQUESTED' })]),
            )
        })

        it("outside-lab user does not see another lab's draft", async () => {
            const { enclave, lab: labA } = await createTestProposalDraft({
                enclaveSlug: 'fetch-lab-cross-enclave',
                studyInfo: { title: 'Cross-lab DRAFT' },
            })
            const labB = await insertTestOrg({ slug: `${enclave.slug}-lab-b`, type: 'lab' })

            await mockSessionWithTestData({ orgSlug: labB.slug, orgType: 'lab' })
            vi.spyOn(logger, 'error').mockImplementation(() => undefined)

            const result = await fetchStudiesForOrgAction({ orgSlug: labA.slug })
            expect(result).toMatchObject({
                error: expect.objectContaining({ permission_denied: expect.any(String) }),
            })
        })
    })

    describe('unsubmitted drafts are private to the Research Lab (OTTER-596)', () => {
        it('data-org (enclave) member cannot getStudyAction an unsubmitted draft by id', async () => {
            const { enclave, studyId } = await createTestProposalDraft({ enclaveSlug: 'otter596-draft-enclave' })

            await mockSessionWithTestData({ orgSlug: enclave.slug, orgType: 'enclave' })
            vi.spyOn(logger, 'error').mockImplementation(() => undefined)

            const result = await getStudyAction({ studyId })
            expect(result).toMatchObject({
                error: expect.objectContaining({ permission_denied: expect.any(String) }),
            })
        })

        it('data-org member CAN getStudyAction once the study is submitted', async () => {
            const { enclave, studyId } = await createTestProposalDraft({ enclaveSlug: 'otter596-submitted-enclave' })
            await setTestStudyStatus(studyId, 'PENDING-REVIEW')

            await mockSessionWithTestData({ orgSlug: enclave.slug, orgType: 'enclave' })
            await expect(getStudyAction({ studyId })).resolves.toMatchObject({ id: studyId })
        })

        it('data-org member CAN getStudyAction a CHANGE-REQUESTED resubmission', async () => {
            const { enclave, studyId } = await createTestProposalDraft({ enclaveSlug: 'otter596-changereq-enclave' })
            await setTestStudyStatus(studyId, 'CHANGE-REQUESTED')

            await mockSessionWithTestData({ orgSlug: enclave.slug, orgType: 'enclave' })
            await expect(getStudyAction({ studyId })).resolves.toMatchObject({ id: studyId })
        })

        it('lab teammate can still getStudyAction their own unsubmitted draft', async () => {
            const { lab, studyId } = await createTestProposalDraft({ enclaveSlug: 'otter596-labaccess-enclave' })

            await mockSessionWithTestData({ orgSlug: lab.slug, orgType: 'lab' })
            await expect(getStudyAction({ studyId })).resolves.toMatchObject({ id: studyId })
        })

        it('data-org member cannot approve an unsubmitted draft, and status stays DRAFT', async () => {
            const { enclave, studyId } = await createTestProposalDraft({ enclaveSlug: 'otter596-approve-draft' })

            await mockSessionWithTestData({ orgSlug: enclave.slug, orgType: 'enclave' })
            const result = await approveProposal(studyId, enclave.slug)

            expect(result).toMatchObject({ error: expect.objectContaining({ study: expect.any(String) }) })
            const row = await db
                .selectFrom('study')
                .select('status')
                .where('id', '=', studyId)
                .executeTakeFirstOrThrow()
            expect(row.status).toBe('DRAFT')
        })

        it('lab member can still submit their own draft (DRAFT to PENDING-REVIEW)', async () => {
            const { lab, studyId } = await createTestProposalDraft({ enclaveSlug: 'otter596-lab-submit' })

            await mockSessionWithTestData({ orgSlug: lab.slug, orgType: 'lab' })
            await expect(finalizeStudySubmissionAction({ studyId })).resolves.toMatchObject({ studyId })

            const row = await db
                .selectFrom('study')
                .select('status')
                .where('id', '=', studyId)
                .executeTakeFirstOrThrow()
            expect(row.status).toBe('PENDING-REVIEW')
        })
    })

    it('reports hasStep2CollabDoc for a DRAFT whose Step 2 edits live only in Yjs', async () => {
        const { lab, studyId } = await createTestProposalDraft({ enclaveSlug: 'step2-collab-doc-enclave' })
        const stateFor = async () => {
            const rows = actionResult(await fetchStudiesForOrgAction({ orgSlug: lab.slug }))
            const row = rows.find((s) => s.id === studyId)!
            return { row, state: projectStudyState(dashboardRawStateFromRow({ ...row, title: row.title ?? '' })) }
        }

        const before = await stateFor()
        expect(before.row.status).toBe('DRAFT')
        expect(before.row.hasStep2CollabDoc).toBe(false)
        expect(before.state.hasStep2Progress).toBe(false)

        await db
            .insertInto('yjsDocument')
            .values({ name: proposalFieldsDocName(studyId), studyId, data: Buffer.from([0]) })
            .execute()

        const after = await stateFor()
        expect(after.row.hasStep2CollabDoc).toBe(true)
        expect(after.state.hasStep2Progress).toBe(true)
    })

    it('DRAFT studies have lastUpdatedAt defaulting to creation time', async () => {
        const { lab, studyId } = await createTestProposalDraft({
            enclaveSlug: 'last-updated-draft-enclave',
        })

        const study = await db
            .selectFrom('study')
            .select(['createdAt', 'lastUpdatedAt'])
            .where('id', '=', studyId)
            .executeTakeFirstOrThrow()
        expect(study.lastUpdatedAt).toEqual(study.createdAt)

        const rows = actionResult(await fetchStudiesForOrgAction({ orgSlug: lab.slug }))
        const row = rows.find((s) => s.id === studyId)!
        expect(row.status).toBe('DRAFT')
        expect(row.submittedAt).toBeNull()
        expect(row.lastUpdatedAt).toEqual(study.createdAt)
    })
})

describe('dashboard rows (OTTER-617)', () => {
    let seq = 0

    // A submitted study from a fresh lab to a fresh enclave, with the lab session active.
    const submittedStudy = async () => {
        seq += 1
        const { enclave, lab, studyId, user } = await createTestProposalDraft({
            enclaveSlug: `otter-617-${seq}-${Date.now()}`,
        })
        const submittedAt = new Date(Date.now() - 60 * 60 * 1000)
        await db.updateTable('study').set({ status: 'PENDING-REVIEW', submittedAt }).where('id', '=', studyId).execute()
        return { enclave, lab, studyId, creator: user, submittedAt }
    }

    const secondsAfter = (date: Date, seconds: number) => new Date(date.getTime() + seconds * 1000)

    const auditCreated = (studyId: string, userId: string, createdAt: Date) =>
        db
            .insertInto('audit')
            .values({ eventType: 'CREATED', recordType: 'STUDY', recordId: studyId, userId, createdAt })
            .execute()

    const proposalComment = (
        studyId: string,
        authorId: string,
        entryType: 'RESUBMISSION-NOTE' | 'REVIEWER-FEEDBACK',
        createdAt: Date,
    ) =>
        db
            .insertInto('studyProposalComment')
            .values({
                studyId,
                authorId,
                authorRole: entryType === 'RESUBMISSION-NOTE' ? 'RESEARCHER' : 'REVIEWER',
                entryType,
                decision: entryType === 'REVIEWER-FEEDBACK' ? 'APPROVE' : null,
                body: JSON.parse(lexicalJson('note')),
                version: 1,
                createdAt,
            })
            .execute()

    const jobWithStatuses = async (studyId: string, rows: Array<[StudyJobStatus, string | null, Date]>) => {
        const job = await db.insertInto('studyJob').values({ studyId }).returning('id').executeTakeFirstOrThrow()
        for (const [status, userId, createdAt] of rows) {
            await db.insertInto('jobStatusChange').values({ studyJobId: job.id, status, userId, createdAt }).execute()
        }
        return job.id
    }

    const yjsDoc = (studyId: string, name: string, updatedAt: Date) =>
        db
            .insertInto('yjsDocument')
            .values({ name, studyId, data: Buffer.from('x'), updatedAt })
            .execute()

    const labRow = async (labSlug: string, studyId: string) => {
        const rows = actionResult(await fetchStudiesForOrgAction({ orgSlug: labSlug }))
        return rows.find((row) => row.id === studyId)!
    }

    const asUser = (
        user: { id: string; clerkId: string },
        org: { id: string; slug: string; type: 'lab' | 'enclave' },
    ) =>
        mockClerkSession({
            clerkUserId: user.clerkId,
            userId: user.id,
            orgSlug: org.slug,
            orgId: org.id,
            orgType: org.type,
        })

    describe('attribution', () => {
        it('names the earliest proposal audit at or after submission, skipping code-origin rows', async () => {
            const { lab, studyId, creator, submittedAt } = await submittedStudy()
            const { user: early } = await insertTestUser({ org: lab })
            const { user: late } = await insertTestUser({ org: lab })
            await auditCreated(studyId, early.id, secondsAfter(submittedAt, -600))
            await auditCreated(studyId, creator.id, secondsAfter(submittedAt, 1))
            await auditCreated(studyId, late.id, secondsAfter(submittedAt, 600))

            const row = await labRow(lab.slug, studyId)

            expect(row.proposalAuditName).toBe(creator.fullName)
        })

        it('carries the newest resubmission note author and the newest code submitter', async () => {
            const { lab, studyId, creator, submittedAt } = await submittedStudy()
            const { user: resubmitter } = await insertTestUser({ org: lab })
            await proposalComment(studyId, creator.id, 'RESUBMISSION-NOTE', secondsAfter(submittedAt, 10))
            await proposalComment(studyId, resubmitter.id, 'RESUBMISSION-NOTE', secondsAfter(submittedAt, 20))
            await jobWithStatuses(studyId, [['CODE-SUBMITTED', creator.id, secondsAfter(submittedAt, 30)]])
            await jobWithStatuses(studyId, [['CODE-SUBMITTED', resubmitter.id, secondsAfter(submittedAt, 40)]])

            const row = await labRow(lab.slug, studyId)

            expect(row.proposalResubmitterName).toBe(resubmitter.fullName)
            expect(row.codeSubmitterName).toBe(resubmitter.fullName)
        })

        it('names the decider of each stage from comments and job statuses', async () => {
            const { enclave, lab, studyId, submittedAt } = await submittedStudy()
            const { user: proposalReviewer } = await insertTestUser({ org: enclave })
            const { user: codeReviewer } = await insertTestUser({ org: enclave })
            const { user: outputsReviewer } = await insertTestUser({ org: enclave })
            await proposalComment(studyId, proposalReviewer.id, 'REVIEWER-FEEDBACK', secondsAfter(submittedAt, 10))
            await jobWithStatuses(studyId, [
                ['CODE-APPROVED', codeReviewer.id, secondsAfter(submittedAt, 20)],
                ['RUN-COMPLETE', null, secondsAfter(submittedAt, 30)],
                ['FILES-APPROVED', outputsReviewer.id, secondsAfter(submittedAt, 40)],
            ])

            const row = await labRow(lab.slug, studyId)

            expect(row.proposalReviewerName).toBe(proposalReviewer.fullName)
            expect(row.codeReviewerName).toBe(codeReviewer.fullName)
            expect(row.outputsReviewerName).toBe(outputsReviewer.fullName)
        })

        it('returns job status history with timestamps, and keeps study pages free of dashboard fields', async () => {
            const { lab, studyId, creator, submittedAt } = await submittedStudy()
            await jobWithStatuses(studyId, [['CODE-SUBMITTED', creator.id, secondsAfter(submittedAt, 10)]])

            const row = await labRow(lab.slug, studyId)
            expect(row.jobStatusChanges[0]).toHaveProperty('createdAt')

            const study = actionResult(await getStudyAction({ studyId }))
            expect(study).not.toHaveProperty('ownEditsAt')
        })
    })

    describe('own edits', () => {
        it('counts lab edits for the researcher only and feedback drafts for the reviewer only', async () => {
            const { enclave, lab, studyId, submittedAt } = await submittedStudy()
            const labEditedAt = secondsAfter(submittedAt, 10)
            const proposalDocAt = secondsAfter(submittedAt, 20)
            const feedbackDocAt = secondsAfter(submittedAt, 30)
            await db.updateTable('study').set({ labEditedAt, reviewerId: null }).where('id', '=', studyId).execute()
            await yjsDoc(studyId, `proposal-${studyId}-impact`, proposalDocAt)
            await yjsDoc(studyId, `review-feedback-${studyId}-v1`, feedbackDocAt)

            expect((await labRow(lab.slug, studyId)).ownEditsAt).toEqual(proposalDocAt)

            const { user: reviewer } = await insertTestUser({ org: enclave })
            asUser(reviewer, enclave)
            const reviewerRows = actionResult(await fetchStudiesForOrgAction({ orgSlug: enclave.slug }))
            expect(reviewerRows.find((row) => row.id === studyId)!.ownEditsAt).toEqual(feedbackDocAt)
        })

        it('does not move backwards when a resubmit deletes the draft documents', async () => {
            const { lab, studyId, creator } = await submittedStudy()
            await setTestStudyStatus(studyId, 'CHANGE-REQUESTED')
            await yjsDoc(studyId, `proposal-${studyId}-impact`, new Date())
            const newest = (row: { lastUpdatedAt: Date; ownEditsAt?: Date | null }) =>
                Math.max(row.lastUpdatedAt.getTime(), row.ownEditsAt?.getTime() ?? 0)
            const before = newest(await labRow(lab.slug, studyId))

            asUser(creator, lab)
            actionResult(
                await resubmitProposalAction({
                    studyId,
                    studyInfo: { title: 'Resubmitted', piName: 'PI', piUserId: creator.id },
                    resubmissionNote: buildFeedback(20),
                }),
            )

            expect(newest(await labRow(lab.slug, studyId))).toBeGreaterThanOrEqual(before)
        })
    })

    describe('My studies membership', () => {
        it('researcher tab lists studies the user created, is PI on, or submitted a version of', async () => {
            const created = await submittedStudy()
            const { user: teammate } = await insertTestUser({ org: created.lab })

            const asPi = await submittedStudy()
            const { user: pi } = await insertTestUser({ org: asPi.lab })
            await db.updateTable('study').set({ piUserId: pi.id }).where('id', '=', asPi.studyId).execute()

            const resubmitted = await submittedStudy()
            const { user: resubmitter } = await insertTestUser({ org: resubmitted.lab })
            await proposalComment(resubmitted.studyId, resubmitter.id, 'RESUBMISSION-NOTE', new Date())

            const codeSubmitted = await submittedStudy()
            const { user: coder } = await insertTestUser({ org: codeSubmitted.lab })
            await jobWithStatuses(codeSubmitted.studyId, [['CODE-SUBMITTED', coder.id, new Date()]])

            const audited = await submittedStudy()
            const { user: submitter } = await insertTestUser({ org: audited.lab })
            await auditCreated(audited.studyId, submitter.id, new Date())

            type TestOrg = { id: string; slug: string; type: 'lab' | 'enclave' }
            const idsFor = async (user: { id: string; clerkId: string }, lab: TestOrg) => {
                asUser(user, lab)
                return actionResult(await fetchStudiesForCurrentResearcherUserAction()).map((row) => row.id)
            }

            expect(await idsFor(created.creator, created.lab)).toContain(created.studyId)
            expect(await idsFor(teammate, created.lab)).not.toContain(created.studyId)
            expect(await idsFor(pi, asPi.lab)).toContain(asPi.studyId)
            expect(await idsFor(resubmitter, resubmitted.lab)).toContain(resubmitted.studyId)
            expect(await idsFor(coder, codeSubmitted.lab)).toContain(codeSubmitted.studyId)
            expect(await idsFor(submitter, audited.lab)).toContain(audited.studyId)
            expect(await idsFor(created.creator, created.lab)).not.toContain(asPi.studyId)
        })

        it('researcher tab leaves out a same-lab study the user has no part in', async () => {
            const own = await submittedStudy()
            const { user: teammate } = await insertTestUser({ org: own.lab })
            const { study: teammateStudy } = await insertTestStudyOnly({
                org: own.enclave,
                submittedByOrg: own.lab,
                researcherId: teammate.id,
            })

            asUser(own.creator, own.lab)
            const ids = actionResult(await fetchStudiesForCurrentResearcherUserAction()).map((row) => row.id)

            expect(ids).toContain(own.studyId)
            expect(ids).not.toContain(teammateStudy.id)
        })

        it('researcher tab hides a teammate draft unless the user is its PI', async () => {
            const { lab, studyId } = await createTestProposalDraft({ enclaveSlug: `otter-617-draft-${Date.now()}` })
            const { user: teammate } = await insertTestUser({ org: lab })

            asUser(teammate, lab)
            expect(actionResult(await fetchStudiesForCurrentResearcherUserAction()).map((r) => r.id)).not.toContain(
                studyId,
            )

            await db.updateTable('study').set({ piUserId: teammate.id }).where('id', '=', studyId).execute()
            expect(actionResult(await fetchStudiesForCurrentResearcherUserAction()).map((r) => r.id)).toContain(studyId)
        })

        it('reviewer tab lists only studies the user decided on, at any stage or round', async () => {
            const proposalDecided = await submittedStudy()
            const { user: reviewer } = await insertTestUser({ org: proposalDecided.enclave })
            await proposalComment(proposalDecided.studyId, reviewer.id, 'REVIEWER-FEEDBACK', new Date())

            const earlierRound = await submittedStudy()
            await db
                .updateTable('study')
                .set({ orgId: proposalDecided.enclave.id })
                .where('id', '=', earlierRound.studyId)
                .execute()
            await jobWithStatuses(earlierRound.studyId, [['CODE-CHANGES-REQUESTED', reviewer.id, new Date()]])
            await jobWithStatuses(earlierRound.studyId, [['CODE-SUBMITTED', earlierRound.creator.id, new Date()]])

            const colleagueOnly = await submittedStudy()
            const { user: colleague } = await insertTestUser({ org: proposalDecided.enclave })
            await db
                .updateTable('study')
                .set({ orgId: proposalDecided.enclave.id })
                .where('id', '=', colleagueOnly.studyId)
                .execute()
            await proposalComment(colleagueOnly.studyId, colleague.id, 'REVIEWER-FEEDBACK', new Date())

            asUser(reviewer, proposalDecided.enclave)
            const ids = actionResult(await fetchStudiesForCurrentReviewerAction()).map((row) => row.id)

            expect(ids).toContain(proposalDecided.studyId)
            expect(ids).toContain(earlierRound.studyId)
            expect(ids).not.toContain(colleagueOnly.studyId)
        })
    })
})

describe('ackAgreementsAction', () => {
    it('sets researcherAgreementsAckedAt when called with role=researcher by lab member', async () => {
        const { org: labOrg, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const enclaveOrg = await insertTestOrg({ slug: 'test-enclave', type: 'enclave' })
        const { study } = await insertTestStudyJobData({ org: enclaveOrg, researcherId: user.id })
        await db.updateTable('study').set({ submittedByOrgId: labOrg.id }).where('id', '=', study.id).execute()

        await ackAgreementsAction({ studyId: study.id, role: 'researcher' })

        const updated = await db
            .selectFrom('study')
            .select(['researcherAgreementsAckedAt', 'reviewerAgreementsAckedAt'])
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()

        expect(updated.researcherAgreementsAckedAt).not.toBeNull()
        expect(updated.reviewerAgreementsAckedAt).toBeNull()
    })

    it('sets reviewerAgreementsAckedAt when called with role=reviewer by enclave member', async () => {
        const { org: enclaveOrg, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const labOrg = await insertTestOrg({ slug: 'test-lab', type: 'lab' })
        const { study } = await insertTestStudyJobData({ org: enclaveOrg, researcherId: user.id })
        await db.updateTable('study').set({ submittedByOrgId: labOrg.id }).where('id', '=', study.id).execute()

        await ackAgreementsAction({ studyId: study.id, role: 'reviewer' })

        const updated = await db
            .selectFrom('study')
            .select(['researcherAgreementsAckedAt', 'reviewerAgreementsAckedAt'])
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()

        expect(updated.reviewerAgreementsAckedAt).not.toBeNull()
        expect(updated.researcherAgreementsAckedAt).toBeNull()
    })

    it('sets reviewerAgreementsAckedAt when an SI admin acks as reviewer for a non-member org', async () => {
        const enclaveOrg = await insertTestOrg({ slug: 'si-admin-enclave', type: 'enclave' })
        const labOrg = await insertTestOrg({ slug: 'si-admin-lab', type: 'lab' })
        const { study } = await insertTestStudyJobData({ org: enclaveOrg })
        await db.updateTable('study').set({ submittedByOrgId: labOrg.id }).where('id', '=', study.id).execute()

        await mockSessionWithTestData({ isSiAdmin: true })

        await ackAgreementsAction({ studyId: study.id, role: 'reviewer' })

        const updated = await db
            .selectFrom('study')
            .select(['researcherAgreementsAckedAt', 'reviewerAgreementsAckedAt'])
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()

        expect(updated.reviewerAgreementsAckedAt).not.toBeNull()
        expect(updated.researcherAgreementsAckedAt).toBeNull()
    })

    it('does NOT set reviewerAgreementsAckedAt when role=researcher and caller would pass both org checks', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id })

        await ackAgreementsAction({ studyId: study.id, role: 'researcher' })

        const updated = await db
            .selectFrom('study')
            .select(['researcherAgreementsAckedAt', 'reviewerAgreementsAckedAt'])
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()

        expect(updated.researcherAgreementsAckedAt).not.toBeNull()
        expect(updated.reviewerAgreementsAckedAt).toBeNull()
    })

    it('does not overwrite an existing ack timestamp', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id })

        await ackAgreementsAction({ studyId: study.id, role: 'researcher' })

        const first = await db
            .selectFrom('study')
            .select('researcherAgreementsAckedAt')
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()

        await ackAgreementsAction({ studyId: study.id, role: 'researcher' })

        const second = await db
            .selectFrom('study')
            .select('researcherAgreementsAckedAt')
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()

        expect(second.researcherAgreementsAckedAt).toEqual(first.researcherAgreementsAckedAt)
    })

    it('fails when role=reviewer but user is not a member of the reviewer org', async () => {
        const enclaveOrg = await insertTestOrg({ slug: 'acker-enclave', type: 'enclave' })
        const { org: labOrg, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({ org: enclaveOrg, researcherId: user.id })
        await db.updateTable('study').set({ submittedByOrgId: labOrg.id }).where('id', '=', study.id).execute()

        await expect(ackAgreementsAction({ studyId: study.id, role: 'reviewer' })).resolves.toMatchObject({
            error: expect.objectContaining({ user: expect.any(String) }),
        })

        const after = await db
            .selectFrom('study')
            .select(['researcherAgreementsAckedAt', 'reviewerAgreementsAckedAt'])
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(after.researcherAgreementsAckedAt).toBeNull()
        expect(after.reviewerAgreementsAckedAt).toBeNull()
    })

    it('fails when user is neither reviewer nor researcher org member', async () => {
        const enclaveOrg = await insertTestOrg({ slug: 'acker-enclave-2', type: 'enclave' })
        const labOrg = await insertTestOrg({ slug: 'acker-lab-2', type: 'lab' })
        const { study } = await insertTestStudyJobData({ org: enclaveOrg })
        await db.updateTable('study').set({ submittedByOrgId: labOrg.id }).where('id', '=', study.id).execute()

        await mockSessionWithTestData({ isSiAdmin: true })

        await expect(ackAgreementsAction({ studyId: study.id, role: 'researcher' })).resolves.toMatchObject({
            error: expect.objectContaining({ user: expect.any(String) }),
        })

        const after = await db
            .selectFrom('study')
            .select(['researcherAgreementsAckedAt', 'reviewerAgreementsAckedAt'])
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(after.researcherAgreementsAckedAt).toBeNull()
        expect(after.reviewerAgreementsAckedAt).toBeNull()
    })
})

describe('submitProposalReviewAction', () => {
    const validFeedback = buildFeedback(60)

    const loadCommentRows = (studyId: string) =>
        db
            .selectFrom('studyProposalComment')
            .select(['authorId', 'authorRole', 'body', 'decision', 'entryType', 'version'])
            .where('studyId', '=', studyId)
            .execute()

    it('approve decision writes review row, approves study, emits approval audit', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, studyStatus: 'PENDING-REVIEW' })

        const result = await submitProposalReviewAction({
            studyId: study.id,
            orgSlug: org.slug,
            decision: 'approve',
            feedback: validFeedback,
            reviewVersion: 1,
        })
        const value = actionResult(result)
        expect(typeof value.submitterFullName).toBe('string')
        expect(value.submitterFullName.length).toBeGreaterThan(0)

        const rows = await loadCommentRows(study.id)
        expect(rows).toHaveLength(1)
        expect(rows[0].decision).toBe('APPROVE')
        expect(rows[0].authorId).toBe(user.id)
        expect(rows[0].authorRole).toBe('REVIEWER')
        expect(rows[0].entryType).toBe('REVIEWER-FEEDBACK')
        expect(rows[0].version).toBe(1)

        const updatedStudy = await db
            .selectFrom('study')
            .select(['status', 'approvedAt', 'reviewerId'])
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(updatedStudy.status).toBe('APPROVED')
        expect(updatedStudy.approvedAt).toBeTruthy()
        expect(updatedStudy.reviewerId).toBe(user.id)

        const job = await latestJobForStudy(study.id)
        expect(job.statusChanges.find((sc) => sc.status === 'JOB-READY')).toBeTruthy()

        await waitFor(async () => {
            const audit = await getAuditEntries(study.id, 'STUDY')
            expect(audit).toContainEqual({
                eventType: 'APPROVED',
                recordType: 'STUDY',
                recordId: study.id,
                userId: user.id,
            })
            expect(audit.some((e) => e.eventType === 'CLARIFICATION_REQUESTED')).toBe(false)
            expect(audit.some((e) => e.eventType === 'REJECTED')).toBe(false)
        })

        await flushDeferred()
        expect(postHogCaptures()).toContainEqual({
            distinctId: user.id,
            event: 'study_proposal_approved',
            properties: expect.objectContaining({
                study_id: study.id,
                do_id: org.id,
                user_role: 'reviewer',
                approver_role: 'reviewer',
                approval_duration_days: expect.any(Number),
            }),
        })
    })

    it.each([
        ['reject', 'vb - research proposal rejected'],
        ['needs-clarification', 'vb - research proposal needs revision'],
    ] as const)('%s emails the researcher', async (decision, template) => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, studyStatus: 'PENDING-REVIEW' })

        await submitProposalReviewAction({
            studyId: study.id,
            orgSlug: org.slug,
            decision,
            feedback: validFeedback,
            reviewVersion: 1,
        })

        await waitFor(() => {
            expect(deliverMock).toHaveBeenCalledWith(expect.objectContaining({ to: user.email, template }))
        })
    })

    it('needs-clarification writes review row, moves study to CHANGE-REQUESTED, writes only clarification audit', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, studyStatus: 'PENDING-REVIEW' })

        const beforeAction = await db
            .selectFrom('study')
            .select('lastUpdatedAt')
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()

        const jobStatusBefore = await db
            .selectFrom('jobStatusChange')
            .innerJoin('studyJob', 'studyJob.id', 'jobStatusChange.studyJobId')
            .where('studyJob.studyId', '=', study.id)
            .select('jobStatusChange.id')
            .execute()

        await submitProposalReviewAction({
            studyId: study.id,
            orgSlug: org.slug,
            decision: 'needs-clarification',
            feedback: validFeedback,
            reviewVersion: 1,
        })

        const rows = await loadCommentRows(study.id)
        expect(rows).toHaveLength(1)
        expect(rows[0].decision).toBe('NEEDS-CLARIFICATION')
        expect(rows[0].authorId).toBe(user.id)
        expect(rows[0].authorRole).toBe('REVIEWER')
        expect(rows[0].entryType).toBe('REVIEWER-FEEDBACK')
        expect(rows[0].version).toBe(1)

        const updatedStudy = await db
            .selectFrom('study')
            .select(['status', 'approvedAt', 'rejectedAt', 'reviewerId', 'lastUpdatedAt'])
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(updatedStudy.status).toBe('CHANGE-REQUESTED')
        expect(updatedStudy.approvedAt).toBeNull()
        expect(updatedStudy.rejectedAt).toBeNull()
        expect(updatedStudy.reviewerId).toBe(user.id)
        expect(new Date(updatedStudy.lastUpdatedAt).getTime()).toBeGreaterThan(
            new Date(beforeAction.lastUpdatedAt).getTime(),
        )

        await waitFor(async () => {
            const audit = await getAuditEntries(study.id, 'STUDY')
            expect(audit).toContainEqual({
                eventType: 'CLARIFICATION_REQUESTED',
                recordType: 'STUDY',
                recordId: study.id,
                userId: user.id,
            })
            expect(audit.some((e) => e.eventType === 'APPROVED')).toBe(false)
            expect(audit.some((e) => e.eventType === 'REJECTED')).toBe(false)
        })

        const jobStatusAfter = await db
            .selectFrom('jobStatusChange')
            .innerJoin('studyJob', 'studyJob.id', 'jobStatusChange.studyJobId')
            .where('studyJob.studyId', '=', study.id)
            .select('jobStatusChange.id')
            .execute()
        expect(jobStatusAfter.length).toBe(jobStatusBefore.length)

        await flushDeferred()
        expect(postHogCaptures()).toContainEqual({
            distinctId: user.id,
            event: 'study_proposal_clarification_requested',
            properties: expect.objectContaining({ study_id: study.id, user_role: 'reviewer' }),
        })
    })

    it('reject decision writes review row, rejects study, emits rejection audit', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, studyStatus: 'PENDING-REVIEW' })

        const beforeAction = await db
            .selectFrom('study')
            .select('lastUpdatedAt')
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()

        await submitProposalReviewAction({
            studyId: study.id,
            orgSlug: org.slug,
            decision: 'reject',
            feedback: validFeedback,
            reviewVersion: 1,
        })

        const rows = await loadCommentRows(study.id)
        expect(rows).toHaveLength(1)
        expect(rows[0].decision).toBe('REJECT')
        expect(rows[0].authorId).toBe(user.id)
        expect(rows[0].authorRole).toBe('REVIEWER')
        expect(rows[0].entryType).toBe('REVIEWER-FEEDBACK')
        expect(rows[0].version).toBe(1)

        const updatedStudy = await db
            .selectFrom('study')
            .select(['status', 'rejectedAt', 'approvedAt', 'reviewerId', 'lastUpdatedAt'])
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(updatedStudy.status).toBe('REJECTED')
        expect(updatedStudy.rejectedAt).toBeTruthy()
        expect(updatedStudy.approvedAt).toBeNull()
        expect(updatedStudy.reviewerId).toBe(user.id)
        expect(new Date(updatedStudy.lastUpdatedAt).getTime()).toBeGreaterThan(
            new Date(beforeAction.lastUpdatedAt).getTime(),
        )

        const job = await latestJobForStudy(study.id)
        expect(job.statusChanges.find((sc) => sc.status === 'CODE-REJECTED')).toBeUndefined()

        await waitFor(async () => {
            const audit = await getAuditEntries(study.id, 'STUDY')
            expect(audit).toContainEqual({
                eventType: 'REJECTED',
                recordType: 'STUDY',
                recordId: study.id,
                userId: user.id,
            })
            expect(audit.some((e) => e.eventType === 'APPROVED')).toBe(false)
        })

        await flushDeferred()
        expect(postHogCaptures()).toContainEqual({
            distinctId: user.id,
            event: 'study_proposal_declined',
            properties: expect.objectContaining({ study_id: study.id, user_role: 'reviewer' }),
        })
    })

    it('reject decision on a study with no job rejects it without writing a job status', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyOnly({
            org,
            researcherId: user.id,
            status: 'PENDING-REVIEW',
            withStudyAgreement: false,
        })

        actionResult(
            await submitProposalReviewAction({
                studyId: study.id,
                orgSlug: org.slug,
                decision: 'reject',
                feedback: validFeedback,
                reviewVersion: 1,
            }),
        )

        const updatedStudy = await db
            .selectFrom('study')
            .select(['status', 'approvedAt', 'rejectedAt', 'reviewerId'])
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(updatedStudy.status).toBe('REJECTED')
        expect(updatedStudy.rejectedAt).toBeTruthy()
        expect(updatedStudy.approvedAt).toBeNull()
        expect(updatedStudy.reviewerId).toBe(user.id)

        await waitFor(async () => {
            expect(await getAuditEntries(study.id, 'STUDY')).toContainEqual({
                eventType: 'REJECTED',
                recordType: 'STUDY',
                recordId: study.id,
                userId: user.id,
            })
        })

        await waitFor(() => {
            expect(deliverMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    to: user.email,
                    template: 'vb - research proposal rejected',
                }),
            )
        })

        const jobStatusChanges = await db
            .selectFrom('jobStatusChange')
            .innerJoin('studyJob', 'studyJob.id', 'jobStatusChange.studyJobId')
            .where('studyJob.studyId', '=', study.id)
            .select('jobStatusChange.id')
            .execute()
        expect(jobStatusChanges).toHaveLength(0)
    })

    it('rejects feedback below minimum word count', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, studyStatus: 'PENDING-REVIEW' })

        const result = await submitProposalReviewAction({
            studyId: study.id,
            orgSlug: org.slug,
            decision: 'approve',
            feedback: buildFeedback(0),
            reviewVersion: 1,
        })

        expect(result).toMatchObject({ error: expect.objectContaining({ feedback: expect.any(String) }) })

        const rows = await loadCommentRows(study.id)
        expect(rows).toHaveLength(0)

        const unchanged = await db
            .selectFrom('study')
            .select('status')
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(unchanged.status).toBe('PENDING-REVIEW')
    })

    it('rejects feedback one character over the cap, naming the field and the cap', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, studyStatus: 'PENDING-REVIEW' })

        const result = await submitProposalReviewAction({
            studyId: study.id,
            orgSlug: org.slug,
            decision: 'approve',
            feedback: 'x'.repeat(REVIEW_FEEDBACK_MAX_CHARACTERS + 1),
            reviewVersion: 1,
        })

        expect(result).toMatchObject({
            error: {
                feedback: overCharacterLimitError(REVIEW_FEEDBACK_FIELD_TITLE, REVIEW_FEEDBACK_MAX_CHARACTERS),
            },
        })

        const rows = await loadCommentRows(study.id)
        expect(rows).toHaveLength(0)
    })

    it('accepts feedback at exactly the cap, and ignores whitespace at its ends', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, studyStatus: 'PENDING-REVIEW' })

        actionResult(
            await submitProposalReviewAction({
                studyId: study.id,
                orgSlug: org.slug,
                decision: 'approve',
                feedback: `  ${'x'.repeat(REVIEW_FEEDBACK_MAX_CHARACTERS)}  `,
                reviewVersion: 1,
            }),
        )

        const rows = await loadCommentRows(study.id)
        expect(rows).toHaveLength(1)
    })

    it('accepts many short words that the old 500-word cap would have rejected', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, studyStatus: 'PENDING-REVIEW' })

        actionResult(
            await submitProposalReviewAction({
                studyId: study.id,
                orgSlug: org.slug,
                decision: 'approve',
                feedback: Array.from({ length: 600 }, () => 'ab').join(' '),
                reviewVersion: 1,
            }),
        )

        const rows = await loadCommentRows(study.id)
        expect(rows).toHaveLength(1)
    })

    it('normalizes plain-text feedback into Lexical JSON on ingest', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, studyStatus: 'PENDING-REVIEW' })

        await submitProposalReviewAction({
            studyId: study.id,
            orgSlug: org.slug,
            decision: 'needs-clarification',
            feedback: validFeedback,
            reviewVersion: 1,
        })

        const rows = await loadCommentRows(study.id)
        expect(rows).toHaveLength(1)
        expect(rows[0].body).toMatchObject({ root: { type: 'root' } })
        expect(JSON.stringify(rows[0].body)).toContain('word1')
    })

    it('accepts pre-formatted Lexical JSON feedback as-is', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, studyStatus: 'PENDING-REVIEW' })

        const lexical = lexicalJson(validFeedback)

        await submitProposalReviewAction({
            studyId: study.id,
            orgSlug: org.slug,
            decision: 'needs-clarification',
            feedback: lexical,
            reviewVersion: 1,
        })

        const rows = await loadCommentRows(study.id)
        expect(rows).toHaveLength(1)
        expect(rows[0].body).toEqual(JSON.parse(lexical))
    })

    it.each(['APPROVED', 'REJECTED', 'ARCHIVED', 'CHANGE-REQUESTED'] as const)(
        'rejects review submission for %s studies without writing a review row',
        async (status) => {
            const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
            const { study } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                studyStatus: 'PENDING-REVIEW',
            })
            await db.updateTable('study').set({ status }).where('id', '=', study.id).execute()

            const result = await submitProposalReviewAction({
                studyId: study.id,
                orgSlug: org.slug,
                decision: 'approve',
                feedback: validFeedback,
                reviewVersion: 1,
            })

            expect(result).toMatchObject({ error: expect.objectContaining({ study: expect.any(String) }) })

            const rows = await loadCommentRows(study.id)
            expect(rows).toHaveLength(0)

            const unchanged = await db
                .selectFrom('study')
                .select('status')
                .where('id', '=', study.id)
                .executeTakeFirstOrThrow()
            expect(unchanged.status).toBe(status)

            await flushDeferred()
            expect(deliverMock).not.toHaveBeenCalledWith(
                expect.objectContaining({ template: 'vb - research proposal approved' }),
            )
        },
    )

    it('rejects a decline on an unsubmitted draft, and status stays DRAFT', async () => {
        const { enclave, studyId } = await createTestProposalDraft({ enclaveSlug: 'otter596-reject-draft' })

        await mockSessionWithTestData({ orgSlug: enclave.slug, orgType: 'enclave' })
        const result = await submitProposalReviewAction({
            studyId,
            orgSlug: enclave.slug,
            decision: 'reject',
            feedback: validFeedback,
            reviewVersion: 1,
        })

        expect(result).toMatchObject({ error: expect.objectContaining({ study: expect.any(String) }) })
        const row = await db.selectFrom('study').select('status').where('id', '=', studyId).executeTakeFirstOrThrow()
        expect(row.status).toBe('DRAFT')
    })

    it('rejects a second proposal review submission after the first decision is recorded', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, studyStatus: 'PENDING-REVIEW' })

        await submitProposalReviewAction({
            studyId: study.id,
            orgSlug: org.slug,
            decision: 'needs-clarification',
            feedback: validFeedback,
            reviewVersion: 1,
        })

        const result = await submitProposalReviewAction({
            studyId: study.id,
            orgSlug: org.slug,
            decision: 'approve',
            feedback: validFeedback,
            reviewVersion: 1,
        })

        expect(result).toMatchObject({ error: expect.objectContaining({ study: expect.any(String) }) })

        const rows = await loadCommentRows(study.id)
        expect(rows).toHaveLength(1)
        expect(rows[0].decision).toBe('NEEDS-CLARIFICATION')

        const unchanged = await db
            .selectFrom('study')
            .select('status')
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(unchanged.status).toBe('CHANGE-REQUESTED')
    })

    it('OTTER-471: parallel approve + reject through submit action, exactly one wins', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, studyStatus: 'PENDING-REVIEW' })

        const results = await Promise.all([
            submitProposalReviewAction({
                studyId: study.id,
                orgSlug: org.slug,
                decision: 'approve',
                feedback: validFeedback,
                reviewVersion: 1,
            }),
            submitProposalReviewAction({
                studyId: study.id,
                orgSlug: org.slug,
                decision: 'reject',
                feedback: validFeedback,
                reviewVersion: 1,
            }),
        ])

        const errors = results.filter((r) => r != null && typeof r === 'object' && 'error' in r)
        expect(errors).toHaveLength(1)

        const updatedStudy = await db
            .selectFrom('study')
            .select(['status', 'approvedAt', 'rejectedAt'])
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()

        const isApproved = updatedStudy.status === 'APPROVED' && !!updatedStudy.approvedAt && !updatedStudy.rejectedAt
        const isRejected = updatedStudy.status === 'REJECTED' && !!updatedStudy.rejectedAt && !updatedStudy.approvedAt
        expect(isApproved || isRejected).toBe(true)
        expect(isApproved && isRejected).toBe(false)

        const rows = await loadCommentRows(study.id)
        expect(rows).toHaveLength(1)
        expect(rows[0].entryType).toBe('REVIEWER-FEEDBACK')
        expect(rows[0].decision === 'APPROVE' || rows[0].decision === 'REJECT').toBe(true)
    })

    it('rejects review submission for code-review studies without writing a review row', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'PENDING-REVIEW',
            jobStatus: 'CODE-SUBMITTED',
        })
        await db.updateTable('study').set({ approvedAt: new Date() }).where('id', '=', study.id).execute()

        const result = await submitProposalReviewAction({
            studyId: study.id,
            orgSlug: org.slug,
            decision: 'needs-clarification',
            feedback: validFeedback,
            reviewVersion: 1,
        })

        expect(result).toMatchObject({ error: expect.objectContaining({ study: expect.any(String) }) })

        const rows = await loadCommentRows(study.id)
        expect(rows).toHaveLength(0)

        const unchanged = await db
            .selectFrom('study')
            .select(['status', 'approvedAt'])
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(unchanged.status).toBe('PENDING-REVIEW')
        expect(unchanged.approvedAt).toBeTruthy()
    })

    it('denies callers without review ability on the study org', async () => {
        const enclaveOrg = await insertTestOrg({ slug: 'reviewer-enclave', type: 'enclave' })
        const { study } = await insertTestStudyJobData({ org: enclaveOrg, studyStatus: 'PENDING-REVIEW' })

        const outsiderOrg = await insertTestOrg({ slug: 'outsider-lab', type: 'lab' })
        const { user: outsider } = await insertTestUser({ org: outsiderOrg })
        mockClerkSession({
            clerkUserId: outsider.clerkId,
            orgSlug: outsiderOrg.slug,
            userId: outsider.id,
            orgId: outsiderOrg.id,
        })
        vi.spyOn(logger, 'error').mockImplementation(() => undefined)

        const result = await submitProposalReviewAction({
            studyId: study.id,
            orgSlug: outsiderOrg.slug,
            decision: 'approve',
            feedback: validFeedback,
            reviewVersion: 1,
        })

        expect(result).toMatchObject({ error: expect.objectContaining({ permission_denied: expect.any(String) }) })

        const rows = await loadCommentRows(study.id)
        expect(rows).toHaveLength(0)

        const unchanged = await db
            .selectFrom('study')
            .select('status')
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(unchanged.status).toBe('PENDING-REVIEW')
    })

    it('purgeReviewFeedbackYjsDocBeforeAt deletes only rows whose updatedAt predates the bound', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, studyStatus: 'PENDING-REVIEW' })

        const before = new Date('2026-01-01T00:00:00Z')
        const versionedName = `review-feedback-${study.id}-v1`

        await db
            .insertInto('yjsDocument')
            .values({
                name: versionedName,
                studyId: study.id,
                data: Buffer.from([0]),
                updatedAt: before,
            })
            .execute()

        await purgeReviewFeedbackYjsDocBeforeAt(db, { studyId: study.id, version: 1, beforeAt: before })

        const afterFirstPurge = await db
            .selectFrom('yjsDocument')
            .select('name')
            .where('name', '=', versionedName)
            .execute()
        expect(afterFirstPurge).toHaveLength(0)

        await db
            .insertInto('yjsDocument')
            .values({
                name: versionedName,
                studyId: study.id,
                data: Buffer.from([0]),
                updatedAt: new Date('2026-01-01T00:00:10Z'),
            })
            .execute()

        await purgeReviewFeedbackYjsDocBeforeAt(db, { studyId: study.id, version: 1, beforeAt: before })

        const afterSecondPurge = await db
            .selectFrom('yjsDocument')
            .select('name')
            .where('name', '=', versionedName)
            .execute()
        expect(afterSecondPurge).toHaveLength(1)
    })

    it('deletes the versioned review-feedback yjs_document so the next round starts fresh', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, studyStatus: 'PENDING-REVIEW' })

        const versionedName = `review-feedback-${study.id}-v1`
        await db
            .insertInto('yjsDocument')
            .values({
                name: versionedName,
                studyId: study.id,
                data: Buffer.from([0]),
            })
            .execute()

        await submitProposalReviewAction({
            studyId: study.id,
            orgSlug: org.slug,
            decision: 'needs-clarification',
            feedback: validFeedback,
            reviewVersion: 1,
        })

        const remaining = await db.selectFrom('yjsDocument').select('name').where('name', '=', versionedName).execute()
        expect(remaining).toHaveLength(0)
    })

    it('rejects a submit whose reviewVersion is stale (researcher already resubmitted)', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, studyStatus: 'PENDING-REVIEW' })

        await db
            .insertInto('studyProposalComment')
            .values({
                studyId: study.id,
                authorId: user.id,
                authorRole: 'RESEARCHER',
                entryType: 'RESUBMISSION-NOTE',
                body: { root: { type: 'root' } },
                version: 2,
            })
            .execute()

        const result = await submitProposalReviewAction({
            studyId: study.id,
            orgSlug: org.slug,
            decision: 'approve',
            feedback: validFeedback,
            reviewVersion: 1,
        })

        expect(result).toMatchObject({ error: expect.objectContaining({ review: expect.stringMatching(/stale/) }) })

        const reviewerRows = await db
            .selectFrom('studyProposalComment')
            .select('entryType')
            .where('studyId', '=', study.id)
            .where('entryType', '=', 'REVIEWER-FEEDBACK')
            .execute()
        expect(reviewerRows).toHaveLength(0)
    })

    it('valid round-2 submit creates a REVIEWER-FEEDBACK with version=2 leaving v1 untouched', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, studyStatus: 'PENDING-REVIEW' })

        const round1Body = { root: { type: 'root', marker: 'round-1-original' } }
        await db
            .insertInto('studyProposalComment')
            .values([
                {
                    studyId: study.id,
                    authorId: user.id,
                    authorRole: 'REVIEWER',
                    entryType: 'REVIEWER-FEEDBACK',
                    decision: 'NEEDS-CLARIFICATION',
                    body: round1Body,
                    version: 1,
                },
                {
                    studyId: study.id,
                    authorId: user.id,
                    authorRole: 'RESEARCHER',
                    entryType: 'RESUBMISSION-NOTE',
                    body: { root: { type: 'root' } },
                    version: 2,
                },
            ])
            .execute()

        const round2Feedback = `round2marker ${buildFeedback(60)}`

        const result = await submitProposalReviewAction({
            studyId: study.id,
            orgSlug: org.slug,
            decision: 'needs-clarification',
            feedback: round2Feedback,
            reviewVersion: 2,
        })
        actionResult(result)

        const reviewerRows = await loadCommentRows(study.id)
        const feedbackRows = reviewerRows.filter((r) => r.entryType === 'REVIEWER-FEEDBACK')
        expect(feedbackRows).toHaveLength(2)

        const v1 = feedbackRows.find((r) => r.version === 1)
        const v2 = feedbackRows.find((r) => r.version === 2)
        expect(v1?.body).toEqual(round1Body)
        expect(v2?.decision).toBe('NEEDS-CLARIFICATION')
        expect(JSON.stringify(v2?.body)).toContain('round2marker')
        expect(JSON.stringify(v2?.body)).not.toContain('round-1-original')
    })

    it('reviewerId flips to the second reviewer across consecutive review rounds', async () => {
        const { user: reviewerA, org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: reviewerA.id,
            studyStatus: 'PENDING-REVIEW',
        })

        await submitProposalReviewAction({
            studyId: study.id,
            orgSlug: org.slug,
            decision: 'needs-clarification',
            feedback: validFeedback,
            reviewVersion: 1,
        })

        const afterA = await db
            .selectFrom('study')
            .select('reviewerId')
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(afterA.reviewerId).toBe(reviewerA.id)

        await db
            .insertInto('studyProposalComment')
            .values({
                studyId: study.id,
                authorId: reviewerA.id,
                authorRole: 'RESEARCHER',
                entryType: 'RESUBMISSION-NOTE',
                body: lexicalJson('resubmitting'),
                version: 2,
            })
            .execute()
        await db.updateTable('study').set({ status: 'PENDING-REVIEW' }).where('id', '=', study.id).execute()

        const { user: reviewerB } = await insertTestUser({ org })
        mockClerkSession({
            userId: reviewerB.id,
            clerkUserId: reviewerB.clerkId,
            orgSlug: org.slug,
            orgId: org.id,
            orgType: 'enclave',
        })

        await submitProposalReviewAction({
            studyId: study.id,
            orgSlug: org.slug,
            decision: 'needs-clarification',
            feedback: validFeedback,
            reviewVersion: 2,
        })

        const afterB = await db
            .selectFrom('study')
            .select('reviewerId')
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(afterB.reviewerId).toBe(reviewerB.id)
        expect(afterB.reviewerId).not.toBe(reviewerA.id)
    })
})

describe('submitCodeReviewDecisionAction', () => {
    const validFeedback = buildFeedback(60)
    const validCriteria = {
        proposalAlignment: 'yes',
        agreementCompliance: 'yes',
        privacyProtection: 'yes',
    } as const

    const setApprovedStudyAndCodeSubmitted = async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study, job } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'PENDING-REVIEW',
            jobStatus: 'CODE-SUBMITTED',
        })
        await db.updateTable('study').set({ approvedAt: new Date() }).where('id', '=', study.id).execute()
        return { user, org, study, job }
    }

    const loadCodeReviewRows = (studyId: string) =>
        db
            .selectFrom('studyReviewComment')
            .select(['authorId', 'decision', 'entryType', 'reviewKind', 'studyJobId', 'criteria', 'round'])
            .where('studyId', '=', studyId)
            .where('reviewKind', '=', 'CODE')
            .orderBy('round', 'asc')
            .execute()

    const simulateResubmitOnSameJob = (jobId: string, userId: string) =>
        db.insertInto('jobStatusChange').values({ studyJobId: jobId, status: 'CODE-SUBMITTED', userId }).execute()

    it('rejects feedback one character over the cap and writes nothing', async () => {
        const { org, study } = await setApprovedStudyAndCodeSubmitted()

        const result = await submitCodeReviewDecisionAction({
            studyId: study.id,
            orgSlug: org.slug,
            decision: 'approve',
            feedback: 'x'.repeat(REVIEW_FEEDBACK_MAX_CHARACTERS + 1),
            criteria: validCriteria,
        })

        expect(result).toMatchObject({
            error: {
                feedback: overCharacterLimitError(REVIEW_FEEDBACK_FIELD_TITLE, REVIEW_FEEDBACK_MAX_CHARACTERS),
            },
        })
        expect(await loadCodeReviewRows(study.id)).toHaveLength(0)
    })

    it('accepts feedback at exactly the cap, and ignores whitespace at its ends', async () => {
        const { org, study } = await setApprovedStudyAndCodeSubmitted()

        actionResult(
            await submitCodeReviewDecisionAction({
                studyId: study.id,
                orgSlug: org.slug,
                decision: 'approve',
                feedback: `  ${'x'.repeat(REVIEW_FEEDBACK_MAX_CHARACTERS)}  `,
                criteria: validCriteria,
            }),
        )

        expect(await loadCodeReviewRows(study.id)).toHaveLength(1)
    })

    it('approve writes a code-review row, advances the job, and approves the study', async () => {
        const { user, org, study, job } = await setApprovedStudyAndCodeSubmitted()

        const result = await submitCodeReviewDecisionAction({
            studyId: study.id,
            orgSlug: org.slug,
            decision: 'approve',
            feedback: validFeedback,
            criteria: validCriteria,
        })
        const value = actionResult(result)
        expect(typeof value.submitterFullName).toBe('string')

        const rows = await loadCodeReviewRows(study.id)
        expect(rows).toHaveLength(1)
        expect(rows[0].decision).toBe('APPROVE')
        expect(rows[0].reviewKind).toBe('CODE')
        expect(rows[0].entryType).toBe('DECISION')
        expect(rows[0].authorId).toBe(user.id)
        expect(rows[0].studyJobId).toBe(job.id)
        expect(rows[0].criteria).toEqual(validCriteria)

        const updatedStudy = await db
            .selectFrom('study')
            .select(['status', 'reviewerId', 'rejectedAt'])
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(updatedStudy.status).toBe('APPROVED')
        expect(updatedStudy.reviewerId).toBe(user.id)
        expect(updatedStudy.rejectedAt).toBeNull()

        const latest = await latestJobForStudy(study.id)
        expect(latest.statusChanges.find((sc) => sc.status === 'CODE-APPROVED')).toBeTruthy()

        await flushDeferred()
        expect(postHogCaptures()).toContainEqual({
            distinctId: user.id,
            event: 'study_code_approved',
            properties: expect.objectContaining({ study_id: study.id, study_job_id: job.id, user_role: 'reviewer' }),
        })
    })

    it.each([
        ['approve', 'vb - code approved'],
        ['needs-clarification', 'vb - code needs revision'],
    ] as const)('%s emails the researcher', async (decision, template) => {
        const { user, org, study } = await setApprovedStudyAndCodeSubmitted()

        actionResult(
            await submitCodeReviewDecisionAction({
                studyId: study.id,
                orgSlug: org.slug,
                decision,
                feedback: validFeedback,
                criteria: validCriteria,
            }),
        )

        await waitFor(() => {
            expect(deliverMock).toHaveBeenCalledWith(expect.objectContaining({ to: user.email, template }))
        })
    })

    it('needs-clarification writes a NEEDS-CLARIFICATION row, advances the job to CODE-CHANGES-REQUESTED, and leaves study.status APPROVED', async () => {
        const { user, org, study, job } = await setApprovedStudyAndCodeSubmitted()

        const result = await submitCodeReviewDecisionAction({
            studyId: study.id,
            orgSlug: org.slug,
            decision: 'needs-clarification',
            feedback: validFeedback,
            criteria: validCriteria,
        })
        const value = actionResult(result)
        expect(typeof value.submitterFullName).toBe('string')

        const rows = await loadCodeReviewRows(study.id)
        expect(rows).toHaveLength(1)
        expect(rows[0].decision).toBe('NEEDS-CLARIFICATION')
        expect(rows[0].reviewKind).toBe('CODE')
        expect(rows[0].entryType).toBe('DECISION')
        expect(rows[0].authorId).toBe(user.id)
        expect(rows[0].studyJobId).toBe(job.id)
        expect(rows[0].criteria).toEqual(validCriteria)

        const updatedStudy = await db
            .selectFrom('study')
            .select(['status', 'approvedAt', 'rejectedAt', 'reviewerId'])
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(updatedStudy.status).toBe('APPROVED')
        expect(updatedStudy.approvedAt).toBeTruthy()
        expect(updatedStudy.rejectedAt).toBeNull()
        expect(updatedStudy.reviewerId).toBe(user.id)

        const latest = await latestJobForStudy(study.id)
        expect(latest.statusChanges.find((sc) => sc.status === 'CODE-CHANGES-REQUESTED')).toBeTruthy()
        expect(latest.statusChanges.find((sc) => sc.status === 'CODE-REJECTED')).toBeUndefined()
        expect(latest.statusChanges.find((sc) => sc.status === 'CODE-APPROVED')).toBeUndefined()

        await flushDeferred()
        expect(postHogCaptures()).toContainEqual({
            distinctId: user.id,
            event: 'study_code_clarification_requested',
            properties: expect.objectContaining({ study_id: study.id, study_job_id: job.id }),
        })
    })

    it('needs-clarification still enforces the feedback word-count minimum', async () => {
        const { org, study } = await setApprovedStudyAndCodeSubmitted()

        const result = await submitCodeReviewDecisionAction({
            studyId: study.id,
            orgSlug: org.slug,
            decision: 'needs-clarification',
            feedback: buildFeedback(0),
            criteria: validCriteria,
        })

        expect(result).toMatchObject({ error: expect.objectContaining({ feedback: expect.any(String) }) })
        expect(await loadCodeReviewRows(study.id)).toHaveLength(0)
    })

    it('rejects feedback below minimum word count', async () => {
        const { org, study } = await setApprovedStudyAndCodeSubmitted()

        const result = await submitCodeReviewDecisionAction({
            studyId: study.id,
            orgSlug: org.slug,
            decision: 'approve',
            feedback: buildFeedback(0),
            criteria: validCriteria,
        })

        expect(result).toMatchObject({ error: expect.objectContaining({ feedback: expect.any(String) }) })
        expect(await loadCodeReviewRows(study.id)).toHaveLength(0)
    })

    it('refuses a reject decision and writes nothing', async () => {
        const { org, study, job } = await setApprovedStudyAndCodeSubmitted()

        const result = await submitCodeReviewDecisionAction({
            studyId: study.id,
            orgSlug: org.slug,
            // @ts-expect-error the schema rejects it; this proves the runtime does too.
            decision: 'reject',
            feedback: validFeedback,
            criteria: validCriteria,
        })

        expect(result).toMatchObject({ error: expect.anything() })
        expect(await loadCodeReviewRows(study.id)).toHaveLength(0)
        const latest = await latestJobForStudy(study.id)
        expect(latest.id).toBe(job.id)
        expect(latest.statusChanges.find((sc) => sc.status === 'CODE-REJECTED')).toBeUndefined()
    })

    it('rejects with a friendly error when no code job exists for the study', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const study = await db
            .insertInto('study')
            .values({
                orgId: org.id,
                submittedByOrgId: org.id,
                containerLocation: 'test-container',
                title: 'proposal-only study',
                researcherId: user.id,
                piName: 'test',
                status: 'PENDING-REVIEW',
                dataSources: ['all'],
                outputMimeType: 'application/zip',
                language: 'R',
            })
            .returningAll()
            .executeTakeFirstOrThrow()
        await seedAcknowledgedStudyAgreement(study.id)

        const result = await submitCodeReviewDecisionAction({
            studyId: study.id,
            orgSlug: org.slug,
            decision: 'approve',
            feedback: validFeedback,
            criteria: validCriteria,
        })

        expect(result).toMatchObject({
            error: expect.objectContaining({ study: expect.stringMatching(/no code submission/i) }),
        })
        expect(await loadCodeReviewRows(study.id)).toHaveLength(0)
    })

    it("accepts 'not-sure' for criteria values", async () => {
        const { org, study } = await setApprovedStudyAndCodeSubmitted()

        const result = await submitCodeReviewDecisionAction({
            studyId: study.id,
            orgSlug: org.slug,
            decision: 'approve',
            feedback: validFeedback,
            criteria: {
                proposalAlignment: 'yes',
                agreementCompliance: 'no',
                privacyProtection: 'not-sure',
            },
        })

        const value = actionResult(result)
        expect(typeof value.submitterFullName).toBe('string')

        const rows = await loadCodeReviewRows(study.id)
        expect(rows).toHaveLength(1)
        expect(rows[0].criteria).toEqual({
            proposalAlignment: 'yes',
            agreementCompliance: 'no',
            privacyProtection: 'not-sure',
        })
    })

    it('rejects when the code job is not in a reviewable state', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'APPROVED',
            jobStatus: 'JOB-READY',
        })

        const result = await submitCodeReviewDecisionAction({
            studyId: study.id,
            orgSlug: org.slug,
            decision: 'approve',
            feedback: validFeedback,
            criteria: validCriteria,
        })

        expect(result).toMatchObject({ error: expect.objectContaining({ study: expect.any(String) }) })
        expect(await loadCodeReviewRows(study.id)).toHaveLength(0)
    })

    it('accepts a code review when study is APPROVED but the latest job is reviewable (resubmission after change request)', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'APPROVED',
            jobStatus: 'CODE-SUBMITTED',
        })

        const result = await submitCodeReviewDecisionAction({
            studyId: study.id,
            orgSlug: org.slug,
            decision: 'needs-clarification',
            feedback: validFeedback,
            criteria: validCriteria,
        })

        expect(result).not.toMatchObject({ error: expect.anything() })
        expect(await loadCodeReviewRows(study.id)).toHaveLength(1)
    })

    it('OTTER-638: accepts the reviewer decision on resubmitted code (changes requested, then approved)', async () => {
        const { user, org, study, job } = await setApprovedStudyAndCodeSubmitted()

        const first = await submitCodeReviewDecisionAction({
            studyId: study.id,
            orgSlug: org.slug,
            decision: 'needs-clarification',
            feedback: validFeedback,
            criteria: validCriteria,
        })
        expect(first).not.toMatchObject({ error: expect.anything() })

        await simulateResubmitOnSameJob(job.id, user.id)

        const second = await submitCodeReviewDecisionAction({
            studyId: study.id,
            orgSlug: org.slug,
            decision: 'approve',
            feedback: validFeedback,
            criteria: validCriteria,
        })
        expect(second).not.toMatchObject({ error: expect.anything() })

        const rows = await loadCodeReviewRows(study.id)
        expect(rows.map((r) => r.round)).toEqual([1, 2])
        expect(rows.map((r) => r.decision)).toEqual(['NEEDS-CLARIFICATION', 'APPROVE'])
        expect(rows.every((r) => r.studyJobId === job.id)).toBe(true)

        const updated = await db
            .selectFrom('study')
            .select('status')
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(updated.status).toBe('APPROVED')
    })

    it('OTTER-638: numbers three rounds on the same job (changes → changes → approve)', async () => {
        const { user, org, study, job } = await setApprovedStudyAndCodeSubmitted()

        await submitCodeReviewDecisionAction({
            studyId: study.id,
            orgSlug: org.slug,
            decision: 'needs-clarification',
            feedback: validFeedback,
            criteria: validCriteria,
        })
        await simulateResubmitOnSameJob(job.id, user.id)

        await submitCodeReviewDecisionAction({
            studyId: study.id,
            orgSlug: org.slug,
            decision: 'needs-clarification',
            feedback: validFeedback,
            criteria: validCriteria,
        })
        await simulateResubmitOnSameJob(job.id, user.id)

        const third = await submitCodeReviewDecisionAction({
            studyId: study.id,
            orgSlug: org.slug,
            decision: 'approve',
            feedback: validFeedback,
            criteria: validCriteria,
        })
        expect(third).not.toMatchObject({ error: expect.anything() })

        const rows = await loadCodeReviewRows(study.id)
        expect(rows.map((r) => r.round)).toEqual([1, 2, 3])
        expect(rows.map((r) => r.decision)).toEqual(['NEEDS-CLARIFICATION', 'NEEDS-CLARIFICATION', 'APPROVE'])
        expect(rows.every((r) => r.studyJobId === job.id)).toBe(true)
    })

    it('OTTER-638: getCodeReviewFeedbackAction labels each round with a distinct, increasing version', async () => {
        const { user, org, study, job } = await setApprovedStudyAndCodeSubmitted()

        await submitCodeReviewDecisionAction({
            studyId: study.id,
            orgSlug: org.slug,
            decision: 'needs-clarification',
            feedback: validFeedback,
            criteria: validCriteria,
        })
        await simulateResubmitOnSameJob(job.id, user.id)
        await submitCodeReviewDecisionAction({
            studyId: study.id,
            orgSlug: org.slug,
            decision: 'approve',
            feedback: validFeedback,
            criteria: validCriteria,
        })

        const entries = actionResult(await getCodeReviewFeedbackAction({ studyId: study.id }))
        const reviewerEntries = entries.filter((e) => e.entryType === 'REVIEWER-FEEDBACK')
        expect(reviewerEntries).toHaveLength(2)
        expect(reviewerEntries.map((e) => e.version).sort()).toEqual([1, 2])
    })

    it('OTTER-638: a same-job resubmission note shares its round version with that round decision', async () => {
        const { user, org, study, job } = await setApprovedStudyAndCodeSubmitted()

        await submitCodeReviewDecisionAction({
            studyId: study.id,
            orgSlug: org.slug,
            decision: 'needs-clarification',
            feedback: validFeedback,
            criteria: validCriteria,
        })

        await simulateResubmitOnSameJob(job.id, user.id)
        await insertTestCodeResubmissionNote({ studyId: study.id, studyJobId: job.id, authorId: user.id, round: 2 })

        await submitCodeReviewDecisionAction({
            studyId: study.id,
            orgSlug: org.slug,
            decision: 'approve',
            feedback: validFeedback,
            criteria: validCriteria,
        })

        const entries = actionResult(await getCodeReviewFeedbackAction({ studyId: study.id }))
        const notes = entries.filter((e) => e.entryType === 'RESUBMISSION-NOTE')
        expect(notes).toHaveLength(1)
        const round2Decision = entries.find((e) => e.entryType === 'REVIEWER-FEEDBACK' && e.decision === 'APPROVE')
        expect(notes[0].version).toBe(2)
        expect(round2Decision?.version).toBe(2)

        const noteIdx = entries.findIndex((e) => e.entryType === 'RESUBMISSION-NOTE')
        const round1Idx = entries.findIndex(
            (e) => e.entryType === 'REVIEWER-FEEDBACK' && e.decision === 'NEEDS-CLARIFICATION',
        )
        expect(noteIdx).toBeLessThan(round1Idx)
    })

    it('OTTER-638: rejects a second decision when code was not resubmitted (still already decided)', async () => {
        const { org, study } = await setApprovedStudyAndCodeSubmitted()

        await submitCodeReviewDecisionAction({
            studyId: study.id,
            orgSlug: org.slug,
            decision: 'needs-clarification',
            feedback: validFeedback,
            criteria: validCriteria,
        })

        const second = await submitCodeReviewDecisionAction({
            studyId: study.id,
            orgSlug: org.slug,
            decision: 'approve',
            feedback: validFeedback,
            criteria: validCriteria,
        })

        expect(second).toMatchObject({ error: { study: expect.stringContaining('already been decided') } })
        expect(await loadCodeReviewRows(study.id)).toHaveLength(1)
    })

    it('OTTER-638: numbers rounds across separate jobs (new job after results approved)', async () => {
        const { user, org, study, job } = await setApprovedStudyAndCodeSubmitted()

        await submitCodeReviewDecisionAction({
            studyId: study.id,
            orgSlug: org.slug,
            decision: 'approve',
            feedback: validFeedback,
            criteria: validCriteria,
        })

        await db
            .insertInto('jobStatusChange')
            .values({ studyJobId: job.id, status: 'FILES-APPROVED', userId: user.id })
            .execute()
        const job2 = await db
            .insertInto('studyJob')
            .values({ studyId: study.id })
            .returning('id')
            .executeTakeFirstOrThrow()
        await db
            .insertInto('jobStatusChange')
            .values({ studyJobId: job2.id, status: 'CODE-SUBMITTED', userId: user.id })
            .execute()

        const second = await submitCodeReviewDecisionAction({
            studyId: study.id,
            orgSlug: org.slug,
            decision: 'approve',
            feedback: validFeedback,
            criteria: validCriteria,
        })
        expect(second).not.toMatchObject({ error: expect.anything() })

        const rows = await loadCodeReviewRows(study.id)
        expect(rows.map((r) => r.round)).toEqual([1, 2])
        expect(rows.map((r) => r.studyJobId)).toEqual([job.id, job2.id])
    })

    it('rejects a duplicate code-review submission for the same job', async () => {
        const { org, study } = await setApprovedStudyAndCodeSubmitted()

        await submitCodeReviewDecisionAction({
            studyId: study.id,
            orgSlug: org.slug,
            decision: 'approve',
            feedback: validFeedback,
            criteria: validCriteria,
        })

        const second = await submitCodeReviewDecisionAction({
            studyId: study.id,
            orgSlug: org.slug,
            decision: 'needs-clarification',
            feedback: validFeedback,
            criteria: validCriteria,
        })

        expect(second).toMatchObject({ error: expect.objectContaining({ study: expect.any(String) }) })
        expect(await loadCodeReviewRows(study.id)).toHaveLength(1)
    })

    it('surfaces a clean ActionFailure (not raw "duplicate key") when two reviewers race past the claim', async () => {
        const { user, org, study, job } = await setApprovedStudyAndCodeSubmitted()
        await db
            .insertInto('studyReviewComment')
            .values({
                studyId: study.id,
                studyJobId: job.id,
                authorId: user.id,
                reviewKind: 'CODE',
                entryType: 'DECISION',
                decision: 'APPROVE',
                body: { root: { type: 'root', children: [] } },
                round: 1,
            })
            .execute()

        const result = await submitCodeReviewDecisionAction({
            studyId: study.id,
            orgSlug: org.slug,
            decision: 'approve',
            feedback: validFeedback,
            criteria: validCriteria,
        })

        expect(result).toMatchObject({
            error: { study: 'another reviewer has already submitted a decision for this study code' },
        })
        expect(await loadCodeReviewRows(study.id)).toHaveLength(1)
    })

    it('OTTER-471: parallel approve + needs-clarification through submit action, exactly one CODE-* decision row', async () => {
        const { org, study, job } = await setApprovedStudyAndCodeSubmitted()

        const results = await Promise.all([
            submitCodeReviewDecisionAction({
                studyId: study.id,
                orgSlug: org.slug,
                decision: 'approve',
                feedback: validFeedback,
                criteria: validCriteria,
            }),
            submitCodeReviewDecisionAction({
                studyId: study.id,
                orgSlug: org.slug,
                decision: 'needs-clarification',
                feedback: validFeedback,
                criteria: validCriteria,
            }),
        ])

        const errors = results.filter((r) => r != null && typeof r === 'object' && 'error' in r)
        expect(errors).toHaveLength(1)

        expect(await loadCodeReviewRows(study.id)).toHaveLength(1)

        const codeApproved = await db
            .selectFrom('jobStatusChange')
            .select('id')
            .where('studyJobId', '=', job.id)
            .where('status', '=', 'CODE-APPROVED')
            .execute()
        const codeChangesRequested = await db
            .selectFrom('jobStatusChange')
            .select('id')
            .where('studyJobId', '=', job.id)
            .where('status', '=', 'CODE-CHANGES-REQUESTED')
            .execute()
        expect(codeApproved.length + codeChangesRequested.length).toBe(1)
    })

    it('composite unique constraint blocks two CODE decisions for the same job in the same round', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study, job } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'PENDING-REVIEW',
            jobStatus: 'CODE-SUBMITTED',
        })
        await db
            .insertInto('studyReviewComment')
            .values({
                studyId: study.id,
                studyJobId: job.id,
                authorId: user.id,
                reviewKind: 'CODE',
                entryType: 'DECISION',
                decision: 'APPROVE',
                body: { root: { type: 'root', children: [] } },
                round: 1,
            })
            .execute()

        await expect(
            db
                .insertInto('studyReviewComment')
                .values({
                    studyId: study.id,
                    studyJobId: job.id,
                    authorId: user.id,
                    reviewKind: 'CODE',
                    entryType: 'DECISION',
                    decision: 'REJECT',
                    body: { root: { type: 'root', children: [] } },
                    round: 1,
                })
                .execute(),
        ).rejects.toThrow(/duplicate key|unique/i)
    })

    it('composite unique constraint allows two CODE decisions for the same job in different rounds', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study, job } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'PENDING-REVIEW',
            jobStatus: 'CODE-SUBMITTED',
        })

        await db
            .insertInto('studyReviewComment')
            .values({
                studyId: study.id,
                studyJobId: job.id,
                authorId: user.id,
                reviewKind: 'CODE',
                entryType: 'DECISION',
                decision: 'NEEDS-CLARIFICATION',
                body: { root: { type: 'root', children: [] } },
                round: 1,
            })
            .execute()

        await expect(
            db
                .insertInto('studyReviewComment')
                .values({
                    studyId: study.id,
                    studyJobId: job.id,
                    authorId: user.id,
                    reviewKind: 'CODE',
                    entryType: 'DECISION',
                    decision: 'APPROVE',
                    body: { root: { type: 'root', children: [] } },
                    round: 2,
                })
                .execute(),
        ).resolves.not.toThrow()

        expect(await loadCodeReviewRows(study.id)).toHaveLength(2)
    })

    it('CHECK constraint blocks DECISION rows with NULL decision', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study, job } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'PENDING-REVIEW',
            jobStatus: 'CODE-SUBMITTED',
        })

        await expect(
            db
                .insertInto('studyReviewComment')
                .values({
                    studyId: study.id,
                    studyJobId: job.id,
                    authorId: user.id,
                    reviewKind: 'CODE',
                    entryType: 'DECISION',
                    decision: null,
                    body: { root: { type: 'root', children: [] } },
                })
                .execute(),
        ).rejects.toThrow(/decision_requires_value|check/i)
    })

    it('CHECK constraint blocks CODE rows with NULL studyJobId', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'PENDING-REVIEW',
            jobStatus: 'CODE-SUBMITTED',
        })

        await expect(
            db
                .insertInto('studyReviewComment')
                .values({
                    studyId: study.id,
                    studyJobId: null,
                    authorId: user.id,
                    reviewKind: 'CODE',
                    entryType: 'DECISION',
                    decision: 'APPROVE',
                    body: { root: { type: 'root', children: [] } },
                })
                .execute(),
        ).rejects.toThrow(/code_requires_job|check/i)
    })

    it('denies callers without review ability on the study org', async () => {
        const enclaveOrg = await insertTestOrg({ slug: 'crd-enclave', type: 'enclave' })
        const { study } = await insertTestStudyJobData({
            org: enclaveOrg,
            studyStatus: 'PENDING-REVIEW',
            jobStatus: 'CODE-SUBMITTED',
        })
        await db.updateTable('study').set({ approvedAt: new Date() }).where('id', '=', study.id).execute()

        const outsiderOrg = await insertTestOrg({ slug: 'crd-outsider', type: 'lab' })
        const { user: outsider } = await insertTestUser({ org: outsiderOrg })
        mockClerkSession({
            clerkUserId: outsider.clerkId,
            orgSlug: outsiderOrg.slug,
            userId: outsider.id,
            orgId: outsiderOrg.id,
        })
        vi.spyOn(logger, 'error').mockImplementation(() => undefined)

        const result = await submitCodeReviewDecisionAction({
            studyId: study.id,
            orgSlug: outsiderOrg.slug,
            decision: 'approve',
            feedback: validFeedback,
            criteria: validCriteria,
        })

        expect(result).toMatchObject({ error: expect.objectContaining({ permission_denied: expect.any(String) }) })
        expect(await loadCodeReviewRows(study.id)).toHaveLength(0)
    })

    it('deletes the code-review-feedback yjs_document keyed by job.id on submit', async () => {
        const { org, study, job } = await setApprovedStudyAndCodeSubmitted()

        await db
            .insertInto('yjsDocument')
            .values({
                name: `code-review-feedback-${job.id}`,
                studyId: study.id,
                data: Buffer.from([0]),
            })
            .execute()

        await submitCodeReviewDecisionAction({
            studyId: study.id,
            orgSlug: org.slug,
            decision: 'approve',
            feedback: validFeedback,
            criteria: validCriteria,
        })

        const remaining = await db
            .selectFrom('yjsDocument')
            .select('name')
            .where('name', '=', `code-review-feedback-${job.id}`)
            .execute()
        expect(remaining).toHaveLength(0)
    })
})

describe('getCodeReviewFeedbackAction', () => {
    it('kind isolation is symmetric: the CODE action does not return RESULTS rows', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study, job } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            jobStatus: 'CODE-SUBMITTED',
        })

        await db
            .insertInto('studyReviewComment')
            .values({
                studyId: study.id,
                studyJobId: job.id,
                authorId: user.id,
                reviewKind: 'RESULTS',
                entryType: 'DECISION',
                decision: 'NEEDS-CLARIFICATION',
                body: JSON.parse(lexicalJson('outputs feedback only')),
                round: 1,
            })
            .execute()

        const codeRows = actionResult(await getCodeReviewFeedbackAction({ studyId: study.id }))
        expect(codeRows.filter((r) => r.entryType === 'REVIEWER-FEEDBACK')).toHaveLength(0)
    })

    it('returns code-review rows ordered newest first and excludes proposal-review rows', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study, job } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'PENDING-REVIEW',
            jobStatus: 'CODE-SUBMITTED',
        })

        await db
            .insertInto('studyProposalComment')
            .values({
                studyId: study.id,
                authorId: user.id,
                authorRole: 'REVIEWER',
                entryType: 'REVIEWER-FEEDBACK',
                decision: 'APPROVE',
                body: { root: { type: 'root', children: [] } },
                version: 1,
            })
            .execute()

        const older = await db
            .insertInto('studyReviewComment')
            .values({
                studyId: study.id,
                studyJobId: job.id,
                authorId: user.id,
                reviewKind: 'CODE',
                entryType: 'DECISION',
                decision: 'REJECT',
                body: { root: { type: 'root', children: [] } },
                criteria: {
                    proposalAlignment: 'yes',
                    agreementCompliance: 'no',
                    privacyProtection: 'yes',
                },
                createdAt: new Date('2026-01-01T00:00:00Z'),
            })
            .returning('id')
            .executeTakeFirstOrThrow()

        const newerJob = await db
            .insertInto('studyJob')
            .values({ studyId: study.id })
            .returning('id')
            .executeTakeFirstOrThrow()
        const newer = await db
            .insertInto('studyReviewComment')
            .values({
                studyId: study.id,
                studyJobId: newerJob.id,
                authorId: user.id,
                reviewKind: 'CODE',
                entryType: 'DECISION',
                decision: 'APPROVE',
                body: { root: { type: 'root', children: [] } },
                criteria: validCriteriaFixture(),
                createdAt: new Date('2026-02-01T00:00:00Z'),
            })
            .returning('id')
            .executeTakeFirstOrThrow()

        const result = await getCodeReviewFeedbackAction({ studyId: study.id })
        const rows = actionResult(result)
        expect(rows).toHaveLength(2)
        expect(rows[0].id).toBe(newer.id)
        expect(rows[1].id).toBe(older.id)
        expect(rows.every((r) => typeof r.authorName === 'string' && r.authorName.length > 0)).toBe(true)
        expect(rows.every((r) => r.entryType === 'REVIEWER-FEEDBACK')).toBe(true)
    })

    it('surfaces resubmission notes beside the decisions, labeled by their own round', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study, job } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'PENDING-REVIEW',
            jobStatus: 'CODE-SUBMITTED',
        })

        await db
            .insertInto('studyReviewComment')
            .values({
                studyId: study.id,
                studyJobId: job.id,
                authorId: user.id,
                reviewKind: 'CODE',
                entryType: 'DECISION',
                decision: 'NEEDS-CLARIFICATION',
                body: { root: { type: 'root', children: [] } },
                criteria: validCriteriaFixture(),
                createdAt: new Date('2026-01-01T00:00:00Z'),
            })
            .execute()
        const note = await insertTestCodeResubmissionNote({
            studyId: study.id,
            studyJobId: job.id,
            authorId: user.id,
            round: 2,
            text: 'fixed things',
            createdAt: new Date('2026-01-02T00:00:00Z'),
        })

        const rows = actionResult(await getCodeReviewFeedbackAction({ studyId: study.id }))
        expect(rows).toHaveLength(2)
        const noteRow = rows.find((r) => r.entryType === 'RESUBMISSION-NOTE')
        const feedbackRow = rows.find((r) => r.entryType === 'REVIEWER-FEEDBACK')
        expect(noteRow).toMatchObject({ id: note.id, version: 2, authorName: user.fullName, decision: null })
        expect(feedbackRow?.version).toBe(1)
    })

    // Change-requested resubmits reuse the job, and the single study_job column they used to share
    // kept only the latest note (OTTER-802).
    it('keeps every round of resubmission notes on one job', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study, job } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'PENDING-REVIEW',
            jobStatus: 'CODE-SUBMITTED',
        })

        for (const round of [2, 3, 4]) {
            await insertTestCodeResubmissionNote({
                studyId: study.id,
                studyJobId: job.id,
                authorId: user.id,
                round,
                createdAt: new Date(`2026-01-0${round}T00:00:00Z`),
            })
        }

        const rows = actionResult(await getCodeReviewFeedbackAction({ studyId: study.id }))
        expect(rows.map((r) => [r.entryType, r.version])).toEqual([
            ['RESUBMISSION-NOTE', 4],
            ['RESUBMISSION-NOTE', 3],
            ['RESUBMISSION-NOTE', 2],
        ])
    })

    it('orders feedback deterministically when review and resubmission note timestamps match', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study, job } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'PENDING-REVIEW',
            jobStatus: 'CODE-SUBMITTED',
        })
        const sharedCreatedAt = new Date('2026-03-01T00:00:00Z')

        const review = await db
            .insertInto('studyReviewComment')
            .values({
                studyId: study.id,
                studyJobId: job.id,
                authorId: user.id,
                reviewKind: 'CODE',
                entryType: 'DECISION',
                decision: 'NEEDS-CLARIFICATION',
                body: { root: { type: 'root', children: [] } },
                criteria: validCriteriaFixture(),
                createdAt: sharedCreatedAt,
            })
            .returning('id')
            .executeTakeFirstOrThrow()
        // Inserted second, so an id tie-break alone would list it first.
        const note = await insertTestCodeResubmissionNote({
            studyId: study.id,
            studyJobId: job.id,
            authorId: user.id,
            round: 1,
            createdAt: sharedCreatedAt,
        })

        const rows = actionResult(await getCodeReviewFeedbackAction({ studyId: study.id }))

        expect(rows.map((row) => row.id)).toEqual([review.id, note.id])
        expect(rows.map((row) => row.entryType)).toEqual(['REVIEWER-FEEDBACK', 'RESUBMISSION-NOTE'])
        expect(rows.map((row) => row.version)).toEqual([1, 1])
    })
})

function validCriteriaFixture() {
    return {
        proposalAlignment: 'yes',
        agreementCompliance: 'yes',
        privacyProtection: 'yes',
    } as const
}

describe('getOutputsDecisionFeedbackAction', () => {
    it('returns RESULTS decision rows ordered newest first and excludes CODE rows', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study, job } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'PENDING-REVIEW',
            jobStatus: 'CODE-SUBMITTED',
        })

        const older = await db
            .insertInto('studyReviewComment')
            .values({
                studyId: study.id,
                studyJobId: job.id,
                authorId: user.id,
                reviewKind: 'RESULTS',
                entryType: 'DECISION',
                decision: 'REJECT',
                body: { root: { type: 'root', children: [] } },
                createdAt: new Date('2026-01-01T00:00:00Z'),
            })
            .returning('id')
            .executeTakeFirstOrThrow()

        const newerJob = await db
            .insertInto('studyJob')
            .values({ studyId: study.id })
            .returning('id')
            .executeTakeFirstOrThrow()
        const newer = await db
            .insertInto('studyReviewComment')
            .values({
                studyId: study.id,
                studyJobId: newerJob.id,
                authorId: user.id,
                reviewKind: 'RESULTS',
                entryType: 'DECISION',
                decision: 'APPROVE',
                body: { root: { type: 'root', children: [] } },
                createdAt: new Date('2026-02-01T00:00:00Z'),
            })
            .returning('id')
            .executeTakeFirstOrThrow()

        await db
            .insertInto('studyReviewComment')
            .values({
                studyId: study.id,
                studyJobId: job.id,
                authorId: user.id,
                reviewKind: 'CODE',
                entryType: 'DECISION',
                decision: 'APPROVE',
                body: { root: { type: 'root', children: [] } },
                criteria: validCriteriaFixture(),
            })
            .execute()

        const rows = actionResult(await getOutputsDecisionFeedbackAction({ studyId: study.id }))
        expect(rows).toHaveLength(2)
        expect(rows[0].id).toBe(newer.id)
        expect(rows[1].id).toBe(older.id)
        expect(rows.every((r) => r.entryType === 'REVIEWER-FEEDBACK')).toBe(true)
        expect(rows.every((r) => typeof r.authorName === 'string' && r.authorName.length > 0)).toBe(true)
    })

    it('excludes the code-phase resubmission note (OTTER-766)', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study, job } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            jobStatus: 'CODE-SUBMITTED',
        })

        await insertTestCodeResubmissionNote({ studyId: study.id, studyJobId: job.id, authorId: user.id, round: 2 })
        await db
            .insertInto('studyReviewComment')
            .values({
                studyId: study.id,
                studyJobId: job.id,
                authorId: user.id,
                reviewKind: 'RESULTS',
                entryType: 'DECISION',
                decision: 'NEEDS-CLARIFICATION',
                body: JSON.parse(lexicalJson('outputs withheld, fix aggregation')),
                round: 1,
            })
            .execute()

        const rows = actionResult(await getOutputsDecisionFeedbackAction({ studyId: study.id }))

        expect(rows).toHaveLength(1)
        expect(rows[0].entryType).toBe('REVIEWER-FEEDBACK')
        expect(rows[0].version).toBe(1)
    })

    it('denies a viewer from an unrelated org', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, jobStatus: 'CODE-SUBMITTED' })

        const otherOrg = await insertTestOrg()
        const { user: otherUser } = await insertTestUser({ org: otherOrg })
        mockClerkSession({
            clerkUserId: otherUser.clerkId,
            orgSlug: otherOrg.slug,
            userId: otherUser.id,
            orgId: otherOrg.id,
        })
        vi.spyOn(logger, 'error').mockImplementation(() => undefined)

        const result = await getOutputsDecisionFeedbackAction({ studyId: study.id })
        expect(result).toEqual({ error: expect.objectContaining({ permission_denied: expect.any(String) }) })
    })
})

describe('softDeleteStudyAction', () => {
    it('soft-deletes a DRAFT study and hides it from the researcher dashboard', async () => {
        const { lab, studyId, user } = await createTestProposalDraft({
            enclaveSlug: 'soft-delete-draft-enclave',
            studyInfo: { title: 'Doomed Draft' },
        })

        const before = await fetchStudiesForOrgAction({ orgSlug: lab.slug })
        expect(before).toEqual(expect.arrayContaining([expect.objectContaining({ id: studyId })]))

        const result = await softDeleteStudyAction({ studyId })
        expect(result).toMatchObject({ title: 'Doomed Draft' })

        const row = await db
            .selectFrom('study')
            .select(['deletedAt', 'status'])
            .where('id', '=', studyId)
            .executeTakeFirstOrThrow()
        expect(row.deletedAt).not.toBeNull()
        expect(row.status).toBe('DRAFT')

        const after = await fetchStudiesForOrgAction({ orgSlug: lab.slug })
        expect(after).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: studyId })]))

        const userView = await fetchStudiesForCurrentResearcherUserAction()
        expect(Array.isArray(userView)).toBe(true)
        if (Array.isArray(userView)) {
            expect(userView.find((s) => s.id === studyId)).toBeUndefined()
        }
        expect(user.id).toBeTruthy()
    })

    it('rejects non-DRAFT studies', async () => {
        const { studyId } = await createTestProposalDraft({
            enclaveSlug: 'soft-delete-non-draft-enclave',
            studyInfo: { title: 'Submitted Study' },
        })
        await setTestStudyStatus(studyId, 'PENDING-REVIEW')

        await expect(softDeleteStudyAction({ studyId })).resolves.toMatchObject({
            error: expect.objectContaining({ study: expect.stringMatching(/only draft/i) }),
        })

        const row = await db.selectFrom('study').select('deletedAt').where('id', '=', studyId).executeTakeFirstOrThrow()
        expect(row.deletedAt).toBeNull()
    })

    it('rejects a researcher who is not the draft author', async () => {
        const { lab, studyId } = await createTestProposalDraft({
            enclaveSlug: 'soft-delete-non-author-enclave',
            studyInfo: { title: 'Colleague Draft' },
        })

        await mockSessionWithTestData({ orgSlug: lab.slug, orgType: 'lab' })

        await expect(softDeleteStudyAction({ studyId })).resolves.toMatchObject({
            error: expect.objectContaining({ user: expect.stringMatching(/only the draft author/i) }),
        })

        const row = await db.selectFrom('study').select('deletedAt').where('id', '=', studyId).executeTakeFirstOrThrow()
        expect(row.deletedAt).toBeNull()
    })

    it('returns not-found for a study that does not exist', async () => {
        await mockSessionWithTestData({ orgType: 'lab' })
        await expect(softDeleteStudyAction({ studyId: BLANK_UUID })).resolves.toMatchObject({
            error: expect.objectContaining({ user: expect.stringMatching(/not found/i) }),
        })
    })
})
