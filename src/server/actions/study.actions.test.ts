import logger from '@/lib/logger'
import { deliver } from '@/server/mailgun'
import {
    db,
    getAuditEntries,
    insertTestOrg,
    insertTestStudyData,
    insertTestStudyJobData,
    insertTestUser,
    mockClerkSession,
    mockSessionWithTestData,
    waitFor,
} from '@/tests/unit.helpers'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { latestJobForStudy } from '../db/queries'
import {
    ackAgreementsAction,
    approveStudyProposalAction,
    doesTestImageExistForStudyAction,
    fetchStudiesForOrgAction,
    getStudyAction,
    rejectStudyProposalAction,
    submitProposalReviewAction,
} from './study.actions'
import { lexicalJson } from '@/lib/word-count'

vi.mock('@/server/mailgun', () => ({
    deliver: vi.fn(),
}))

const deliverMock = deliver as unknown as Mock

describe('Study Actions', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    // Approving a proposal sends "proposal approved" email to the researcher
    it('successfully approves a study proposal', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, studyStatus: 'PENDING-REVIEW' })

        await approveStudyProposalAction({ studyId: study.id, orgSlug: org.slug })

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

        const job = await latestJobForStudy(study.id)

        expect(job.statusChanges.find((sc) => sc.status == 'JOB-READY')).toBeTruthy()

        const updatedStudy = await db
            .selectFrom('study')
            .select(['status', 'approvedAt', 'rejectedAt', 'reviewerId'])
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(updatedStudy.status).toBe('APPROVED')
        expect(updatedStudy.approvedAt).toBeTruthy()
        expect(updatedStudy.rejectedAt).toBeNull()
        expect(updatedStudy.reviewerId).toBe(user.id)
    })

    it('successfully approves a python language study proposal', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })

        await db
            .insertInto('orgCodeEnv')
            .values({
                name: 'Python Base',
                identifier: 'python-base',
                language: 'PYTHON',
                commandLines: { py: 'python %f' },
                url: 'test/url',
                isTesting: true,
                orgId: org.id,
                starterCodeFileNames: ['starter.py'],
            })
            .execute()

        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'PENDING-REVIEW',
            language: 'PYTHON',
        })

        await approveStudyProposalAction({ studyId: study.id, orgSlug: org.slug })

        const job = await latestJobForStudy(study.id)

        expect(job.statusChanges.find((sc) => sc.status == 'JOB-READY')).toBeTruthy()
    })

    it('does not approve a study proposal twice', async () => {
        const { user, org } = await mockSessionWithTestData()
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, studyStatus: 'PENDING-REVIEW' })

        // Attempt to approve the same study twice in parallel
        await Promise.all([
            approveStudyProposalAction({ studyId: study.id, orgSlug: org.slug }),
            approveStudyProposalAction({ studyId: study.id, orgSlug: org.slug }),
        ])

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

    it('sends code-approved event and restores APPROVED status for previously approved study', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'PENDING-REVIEW',
            jobStatus: 'CODE-SCANNED',
        })
        await db.updateTable('study').set({ approvedAt: new Date() }).where('id', '=', study.id).execute()

        await approveStudyProposalAction({ studyId: study.id, orgSlug: org.slug })

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
                    template: 'vb - code approved',
                }),
            )
        })
        expect(deliverMock).not.toHaveBeenCalledWith(
            expect.objectContaining({
                template: 'vb - research proposal approved',
            }),
        )

        const updatedStudy = await db
            .selectFrom('study')
            .select(['status', 'approvedAt', 'rejectedAt', 'reviewerId'])
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(updatedStudy.status).toBe('APPROVED')
        expect(updatedStudy.approvedAt).toBeTruthy()
        expect(updatedStudy.rejectedAt).toBeNull()
        expect(updatedStudy.reviewerId).toBe(user.id)
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
        // was inserted in beforeEach, should return error
        vi.spyOn(logger, 'error').mockImplementation(() => undefined)
        const result = await getStudyAction({ studyId })
        expect(result).toEqual({ error: expect.objectContaining({ permission_denied: expect.any(String) }) })
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('cannot view Study'))
    })

    describe('rejectStudyProposalAction', () => {
        // Rejecting a study that has code sends "study results rejected" email to the researcher
        it('rejects a study with a job', async () => {
            const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
            const { study } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                studyStatus: 'PENDING-REVIEW',
            })

            await rejectStudyProposalAction({ studyId: study.id, orgSlug: org.slug })

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
                        template: 'vb - code rejected',
                    }),
                )
            })

            const job = await latestJobForStudy(study.id)
            expect(job.statusChanges.find((sc) => sc.status === 'CODE-REJECTED')).toBeTruthy()
        })
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

        // Approving a proposal-only study sends "proposal approved" email to the researcher
        it('approves a proposal-only study without crashing', async () => {
            const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
            const study = await insertProposalOnlyStudy(org, user.id)

            await approveStudyProposalAction({ studyId: study.id, orgSlug: org.slug })

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

        // Rejecting a proposal-only study sends "proposal rejected" email to the researcher
        it('rejects a proposal-only study without crashing', async () => {
            const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
            const study = await insertProposalOnlyStudy(org, user.id)

            await rejectStudyProposalAction({ studyId: study.id, orgSlug: org.slug })

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
    })

    describe('doesTestImageExistForStudyAction', () => {
        it('returns true when a test image exists for the study language and org', async () => {
            const { org } = await mockSessionWithTestData({ orgType: 'enclave' })
            const { study } = await insertTestStudyJobData({ org, studyStatus: 'PENDING-REVIEW' })
            await db
                .insertInto('orgCodeEnv')
                .values({
                    name: 'Test R Image',
                    identifier: 'test-r-image',
                    language: 'R',
                    commandLines: { r: 'Rscript %f' },
                    url: 'test/url',
                    isTesting: true,
                    orgId: org.id,
                    starterCodeFileNames: ['starter.R'],
                })
                .execute()

            const result = await doesTestImageExistForStudyAction({ studyId: study.id })

            expect(result).toBe(true)
        })

        it('returns false when no test image exists for the study org', async () => {
            const { org } = await mockSessionWithTestData({ orgType: 'enclave' })
            const { study } = await insertTestStudyJobData({ org, studyStatus: 'PENDING-REVIEW' })

            const result = await doesTestImageExistForStudyAction({ studyId: study.id })

            expect(result).toBe(false)
        })

        it('returns false when only non-test images exist', async () => {
            const { org } = await mockSessionWithTestData({ orgType: 'enclave' })
            const { study } = await insertTestStudyJobData({ org, studyStatus: 'PENDING-REVIEW' })
            await db
                .insertInto('orgCodeEnv')
                .values({
                    name: 'Non-Test R Image',
                    identifier: 'non-test-r',
                    language: 'R',
                    commandLines: { r: 'Rscript %f' },
                    url: 'test/url',
                    isTesting: false,
                    orgId: org.id,
                    starterCodeFileNames: ['starter.R'],
                })
                .execute()

            const result = await doesTestImageExistForStudyAction({ studyId: study.id })

            expect(result).toBe(false)
        })

        it('returns false for a test image in a different org', async () => {
            const { org: studyOrg } = await mockSessionWithTestData({ orgType: 'enclave' })
            const { study } = await insertTestStudyJobData({ org: studyOrg, studyStatus: 'PENDING-REVIEW' })

            const otherOrg = await insertTestOrg()
            await db
                .insertInto('orgCodeEnv')
                .values({
                    name: 'Other Org Test Image',
                    identifier: 'other-org-test',
                    language: 'R',
                    commandLines: { r: 'Rscript %f' },
                    url: 'test/url',
                    isTesting: true,
                    orgId: otherOrg.id,
                    starterCodeFileNames: ['starter.R'],
                })
                .execute()

            const result = await doesTestImageExistForStudyAction({ studyId: study.id })

            expect(result).toBe(false)
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
})

describe('ackAgreementsAction', () => {
    it('sets researcherAgreementsAckedAt when called by lab member', async () => {
        const { org: labOrg, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const enclaveOrg = await insertTestOrg({ slug: 'test-enclave', type: 'enclave' })
        const { study } = await insertTestStudyJobData({ org: enclaveOrg, researcherId: user.id })
        // Set submittedByOrgId to the lab org (realistic: enclave owns, lab submits)
        await db.updateTable('study').set({ submittedByOrgId: labOrg.id }).where('id', '=', study.id).execute()

        await ackAgreementsAction({ studyId: study.id })

        const updated = await db
            .selectFrom('study')
            .select(['researcherAgreementsAckedAt', 'reviewerAgreementsAckedAt'])
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()

        expect(updated.researcherAgreementsAckedAt).not.toBeNull()
        expect(updated.reviewerAgreementsAckedAt).toBeNull()
    })

    it('sets reviewerAgreementsAckedAt when called by enclave member', async () => {
        const { org: enclaveOrg, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const labOrg = await insertTestOrg({ slug: 'test-lab', type: 'lab' })
        const { study } = await insertTestStudyJobData({ org: enclaveOrg, researcherId: user.id })
        await db.updateTable('study').set({ submittedByOrgId: labOrg.id }).where('id', '=', study.id).execute()

        await ackAgreementsAction({ studyId: study.id })

        const updated = await db
            .selectFrom('study')
            .select(['researcherAgreementsAckedAt', 'reviewerAgreementsAckedAt'])
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()

        expect(updated.reviewerAgreementsAckedAt).not.toBeNull()
        expect(updated.researcherAgreementsAckedAt).toBeNull()
    })

    it('does not overwrite an existing ack timestamp', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id })

        await ackAgreementsAction({ studyId: study.id })

        const first = await db
            .selectFrom('study')
            .select('researcherAgreementsAckedAt')
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()

        // Call again — should not change the timestamp
        await ackAgreementsAction({ studyId: study.id })

        const second = await db
            .selectFrom('study')
            .select('researcherAgreementsAckedAt')
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()

        expect(second.researcherAgreementsAckedAt).toEqual(first.researcherAgreementsAckedAt)
    })

    it('fails when user is neither reviewer nor researcher org member', async () => {
        const enclaveOrg = await insertTestOrg({ slug: 'acker-enclave', type: 'enclave' })
        const labOrg = await insertTestOrg({ slug: 'acker-lab', type: 'lab' })
        const { study } = await insertTestStudyJobData({ org: enclaveOrg })
        await db.updateTable('study').set({ submittedByOrgId: labOrg.id }).where('id', '=', study.id).execute()

        // SI admin can `view` any Study but belongs to neither org — handler should refuse the ack
        await mockSessionWithTestData({ isSiAdmin: true })

        await expect(ackAgreementsAction({ studyId: study.id })).resolves.toMatchObject({
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
    const buildFeedback = (wordCount: number) => Array.from({ length: wordCount }, (_, i) => `word${i + 1}`).join(' ')
    const validFeedback = buildFeedback(60)

    const loadReviewRows = (studyId: string) =>
        db
            .selectFrom('studyProposalReview')
            .select(['decision', 'feedback', 'reviewerId'])
            .where('studyId', '=', studyId)
            .execute()

    it('approve decision writes review row, approves study, emits approval audit', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, studyStatus: 'PENDING-REVIEW' })

        await submitProposalReviewAction({
            studyId: study.id,
            orgSlug: org.slug,
            decision: 'approve',
            feedback: validFeedback,
        })

        const rows = await loadReviewRows(study.id)
        expect(rows).toHaveLength(1)
        expect(rows[0].decision).toBe('APPROVE')
        expect(rows[0].reviewerId).toBe(user.id)

        const updatedStudy = await db
            .selectFrom('study')
            .select(['status', 'approvedAt', 'reviewerId'])
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(updatedStudy.status).toBe('APPROVED')
        expect(updatedStudy.approvedAt).toBeTruthy()
        expect(updatedStudy.reviewerId).toBe(user.id)

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
    })

    it('needs-clarification writes review row, moves study to PROPOSAL-CHANGE-REQUESTED, writes only clarification audit', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, studyStatus: 'PENDING-REVIEW' })

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
        })

        const rows = await loadReviewRows(study.id)
        expect(rows).toHaveLength(1)
        expect(rows[0].decision).toBe('NEEDS-CLARIFICATION')

        const updatedStudy = await db
            .selectFrom('study')
            .select(['status', 'approvedAt', 'rejectedAt', 'reviewerId'])
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(updatedStudy.status).toBe('PROPOSAL-CHANGE-REQUESTED')
        expect(updatedStudy.approvedAt).toBeNull()
        expect(updatedStudy.rejectedAt).toBeNull()
        expect(updatedStudy.reviewerId).toBe(user.id)

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
    })

    it('reject decision writes review row, rejects study, emits rejection audit', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, studyStatus: 'PENDING-REVIEW' })

        await submitProposalReviewAction({
            studyId: study.id,
            orgSlug: org.slug,
            decision: 'reject',
            feedback: validFeedback,
        })

        const rows = await loadReviewRows(study.id)
        expect(rows).toHaveLength(1)
        expect(rows[0].decision).toBe('REJECT')

        const updatedStudy = await db
            .selectFrom('study')
            .select(['status', 'rejectedAt', 'approvedAt', 'reviewerId'])
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(updatedStudy.status).toBe('REJECTED')
        expect(updatedStudy.rejectedAt).toBeTruthy()
        expect(updatedStudy.approvedAt).toBeNull()
        expect(updatedStudy.reviewerId).toBe(user.id)

        // insertTestStudyJobData creates a job, so reject runs the CODE-REJECTED path which still audits as REJECTED
        const job = await latestJobForStudy(study.id)
        expect(job.statusChanges.find((sc) => sc.status === 'CODE-REJECTED')).toBeTruthy()

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
    })

    it('rejects feedback below minimum word count', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, studyStatus: 'PENDING-REVIEW' })

        const result = await submitProposalReviewAction({
            studyId: study.id,
            orgSlug: org.slug,
            decision: 'approve',
            feedback: buildFeedback(10),
        })

        expect(result).toMatchObject({ error: expect.objectContaining({ feedback: expect.any(String) }) })

        const rows = await loadReviewRows(study.id)
        expect(rows).toHaveLength(0)

        const unchanged = await db
            .selectFrom('study')
            .select('status')
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(unchanged.status).toBe('PENDING-REVIEW')
    })

    it('rejects feedback above maximum word count', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, studyStatus: 'PENDING-REVIEW' })

        const result = await submitProposalReviewAction({
            studyId: study.id,
            orgSlug: org.slug,
            decision: 'approve',
            feedback: buildFeedback(501),
        })

        expect(result).toMatchObject({ error: expect.objectContaining({ feedback: expect.any(String) }) })

        const rows = await loadReviewRows(study.id)
        expect(rows).toHaveLength(0)
    })

    it('normalizes plain-text feedback into Lexical JSON on ingest', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, studyStatus: 'PENDING-REVIEW' })

        await submitProposalReviewAction({
            studyId: study.id,
            orgSlug: org.slug,
            decision: 'needs-clarification',
            feedback: validFeedback,
        })

        const rows = await loadReviewRows(study.id)
        expect(rows).toHaveLength(1)
        expect(rows[0].feedback).toMatchObject({ root: { type: 'root' } })
        expect(JSON.stringify(rows[0].feedback)).toContain('word1')
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
        })

        const rows = await loadReviewRows(study.id)
        expect(rows).toHaveLength(1)
        expect(rows[0].feedback).toEqual(JSON.parse(lexical))
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
        })

        expect(result).toMatchObject({ error: expect.objectContaining({ permission_denied: expect.any(String) }) })

        const rows = await loadReviewRows(study.id)
        expect(rows).toHaveLength(0)

        const unchanged = await db
            .selectFrom('study')
            .select('status')
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(unchanged.status).toBe('PENDING-REVIEW')
    })
})
