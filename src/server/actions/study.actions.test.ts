import logger from '@/lib/logger'
import { deliver } from '@/server/mailgun'
import {
    BLANK_UUID,
    actionResult,
    buildFeedback,
    createTestProposalDraft,
    db,
    getAuditEntries,
    insertTestOrg,
    insertTestStudyData,
    insertTestStudyJobData,
    insertTestUser,
    mockClerkSession,
    mockSessionWithTestData,
    setTestStudyStatus,
    waitFor,
} from '@/tests/unit.helpers'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { latestJobForStudy } from '../db/queries'
import {
    ackAgreementsAction,
    approveStudyProposalAction,
    doesTestImageExistForStudyAction,
    fetchStudiesForCurrentResearcherUserAction,
    fetchStudiesForOrgAction,
    getCodeReviewFeedbackAction,
    getStudyAction,
    rejectStudyProposalAction,
    softDeleteStudyAction,
    submitCodeReviewDecisionAction,
    submitProposalReviewAction,
} from './study.actions'
import { purgeReviewFeedbackYjsDocBeforeAt } from '@/server/db/yjs-cleanup'
import { lexicalJson } from '@/lib/lexical'

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

    describe('fetchStudiesForOrgAction lab-branch visibility (OTTER-497)', () => {
        it('lab teammate sees a DRAFT created by another teammate', async () => {
            const { lab, studyId } = await createTestProposalDraft({
                enclaveSlug: 'fetch-lab-draft-enclave',
                studyInfo: { title: 'Teammate DRAFT' },
            })

            // User B in the same lab.
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

            // User in labB tries to read labA's dashboard. CASL denies cross-org viewing.
            await mockSessionWithTestData({ orgSlug: labB.slug, orgType: 'lab' })
            vi.spyOn(logger, 'error').mockImplementation(() => undefined)

            const result = await fetchStudiesForOrgAction({ orgSlug: labA.slug })
            expect(result).toMatchObject({
                error: expect.objectContaining({ permission_denied: expect.any(String) }),
            })
        })
    })

    describe('fetchStudiesForOrgAction lastUpdatedAt', () => {
        it('falls back to createdAt for DRAFT studies (no status changes yet)', async () => {
            const { lab, studyId } = await createTestProposalDraft({
                enclaveSlug: 'last-updated-draft-enclave',
            })
            const createdAt = new Date('2026-01-01T00:00:00Z')
            await db.updateTable('study').set({ createdAt }).where('id', '=', studyId).execute()

            const rows = actionResult(await fetchStudiesForOrgAction({ orgSlug: lab.slug }))
            const row = rows.find((s) => s.id === studyId)!
            expect(row.status).toBe('DRAFT')
            expect(row.submittedAt).toBeNull()
            expect(row.lastUpdatedAt).toEqual(createdAt)
        })

        it('advances on CHANGE-REQUESTED clarification then on resubmit', async () => {
            const { lab, studyId, user } = await createTestProposalDraft({
                enclaveSlug: 'last-updated-enclave',
            })
            const submittedAt = new Date('2026-01-01T00:00:00Z')
            await db
                .updateTable('study')
                .set({ status: 'PENDING-REVIEW', submittedAt })
                .where('id', '=', studyId)
                .execute()

            const findRow = async () => {
                const rows = actionResult(await fetchStudiesForOrgAction({ orgSlug: lab.slug }))
                const row = rows.find((s) => s.id === studyId)
                if (!row) throw new Error('study not found in dashboard rows')
                return row
            }

            const initial = await findRow()
            expect(initial.lastUpdatedAt).toEqual(submittedAt)

            // Reviewer marks the proposal NEEDS-CLARIFICATION (study → CHANGE-REQUESTED)
            const clarificationAt = new Date('2026-01-02T00:00:00Z')
            await db
                .insertInto('studyProposalComment')
                .values({
                    studyId,
                    authorId: user.id,
                    authorRole: 'REVIEWER',
                    entryType: 'REVIEWER-FEEDBACK',
                    decision: 'NEEDS-CLARIFICATION',
                    body: lexicalJson('please clarify'),
                    version: 1,
                    createdAt: clarificationAt,
                })
                .execute()
            await db.updateTable('study').set({ status: 'CHANGE-REQUESTED' }).where('id', '=', studyId).execute()

            const afterClarification = await findRow()
            expect(afterClarification.lastUpdatedAt).toEqual(clarificationAt)

            // Researcher resubmits — RESUBMISSION-NOTE comment is the freshest signal
            const resubmitAt = new Date('2026-01-03T00:00:00Z')
            await db
                .insertInto('studyProposalComment')
                .values({
                    studyId,
                    authorId: user.id,
                    authorRole: 'RESEARCHER',
                    entryType: 'RESUBMISSION-NOTE',
                    decision: null,
                    body: lexicalJson('clarified, resubmitting'),
                    version: 2,
                    createdAt: resubmitAt,
                })
                .execute()
            await db.updateTable('study').set({ status: 'PENDING-REVIEW' }).where('id', '=', studyId).execute()

            const afterResubmit = await findRow()
            expect(afterResubmit.submittedAt).toEqual(submittedAt)
            expect(afterResubmit.lastUpdatedAt).toEqual(resubmitAt)
        })
    })
})

describe('ackAgreementsAction', () => {
    it('sets researcherAgreementsAckedAt when called with role=researcher by lab member', async () => {
        const { org: labOrg, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const enclaveOrg = await insertTestOrg({ slug: 'test-enclave', type: 'enclave' })
        const { study } = await insertTestStudyJobData({ org: enclaveOrg, researcherId: user.id })
        // Set submittedByOrgId to the lab org (realistic: enclave owns, lab submits)
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

    // OTTER-546: a user who is a member of BOTH orgs (e.g. multi-org QA accounts, or
    // a test fixture where orgId === submittedByOrgId) used to silently ack both
    // columns when proceeding from the researcher view, which skipped the reviewer's
    // Agreements page on their next visit. With the explicit `role` param, acking on
    // the researcher side never touches the reviewer column even when the caller
    // would otherwise pass both org checks.
    it('does NOT set reviewerAgreementsAckedAt when role=researcher and caller would pass both org checks', async () => {
        // insertTestStudyJobData defaults orgId === submittedByOrgId, which is the
        // same condition as a multi-org QA user against a real study.
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

        // Call again — should not change the timestamp
        await ackAgreementsAction({ studyId: study.id, role: 'researcher' })

        const second = await db
            .selectFrom('study')
            .select('researcherAgreementsAckedAt')
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()

        expect(second.researcherAgreementsAckedAt).toEqual(first.researcherAgreementsAckedAt)
    })

    it('fails when role=reviewer but user is not a member of the reviewer org', async () => {
        // Caller belongs to the lab that submitted the study (so the `view Study`
        // ability check passes), but does NOT belong to the reviewer enclave — they
        // must not be able to ack as a reviewer.
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

        // SI admin can `view` any Study but belongs to neither org — handler should refuse the ack
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

    it('needs-clarification writes review row, moves study to CHANGE-REQUESTED, writes only clarification audit', async () => {
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
            .select(['status', 'approvedAt', 'rejectedAt', 'reviewerId'])
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(updatedStudy.status).toBe('CHANGE-REQUESTED')
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
            .select(['status', 'rejectedAt', 'approvedAt', 'reviewerId'])
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(updatedStudy.status).toBe('REJECTED')
        expect(updatedStudy.rejectedAt).toBeTruthy()
        expect(updatedStudy.approvedAt).toBeNull()
        expect(updatedStudy.reviewerId).toBe(user.id)

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

    it('rejects feedback above maximum word count', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, studyStatus: 'PENDING-REVIEW' })

        const result = await submitProposalReviewAction({
            studyId: study.id,
            orgSlug: org.slug,
            decision: 'approve',
            feedback: buildFeedback(501),
            reviewVersion: 1,
        })

        expect(result).toMatchObject({ error: expect.objectContaining({ feedback: expect.any(String) }) })

        const rows = await loadCommentRows(study.id)
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
        },
    )

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

    // OTTER-471: exercises the claim CAS under true concurrency (Promise.all),
    // not just the sequential A-then-B path covered above.
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

        // Stale row from before the captured submit timestamp; should be deleted.
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

        // Fresh row from a fast clarification-and-reopen cycle; should survive a bounded purge
        // whose beforeAt predates this row's updatedAt.
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

        // Simulate the reviewer's drafted-but-not-submitted Y.Doc state for round 1.
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

        // Seed a RESUBMISSION-NOTE so currentReviewVersion returns 2; the
        // client thinks it's submitting round 1.
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

    // OTTER-574: reviewerId is dynamic and tracks whoever last took a decision action.
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

        // Researcher resubmits: bump version + flip status back to PENDING-REVIEW so round 2 can run.
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
        securityChecks: 'yes',
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
        // Code review only happens after the proposal was approved; mirror that here.
        await db.updateTable('study').set({ approvedAt: new Date() }).where('id', '=', study.id).execute()
        return { user, org, study, job }
    }

    const loadCodeReviewRows = (studyId: string) =>
        db
            .selectFrom('studyReviewComment')
            .select(['authorId', 'decision', 'entryType', 'reviewKind', 'studyJobId', 'criteria'])
            .where('studyId', '=', studyId)
            .where('reviewKind', '=', 'CODE')
            .execute()

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
    })

    it('reject writes a code-review row, marks job CODE-REJECTED, and rejects the study', async () => {
        const { user, org, study, job } = await setApprovedStudyAndCodeSubmitted()

        await submitCodeReviewDecisionAction({
            studyId: study.id,
            orgSlug: org.slug,
            decision: 'reject',
            feedback: validFeedback,
            criteria: validCriteria,
        })

        const rows = await loadCodeReviewRows(study.id)
        expect(rows).toHaveLength(1)
        expect(rows[0].decision).toBe('REJECT')
        expect(rows[0].studyJobId).toBe(job.id)

        const updatedStudy = await db
            .selectFrom('study')
            .select(['status', 'rejectedAt', 'approvedAt', 'reviewerId'])
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(updatedStudy.status).toBe('REJECTED')
        expect(updatedStudy.rejectedAt).toBeTruthy()
        expect(updatedStudy.approvedAt).toBeNull()
        expect(updatedStudy.reviewerId).toBe(user.id)

        const latest = await latestJobForStudy(study.id)
        expect(latest.statusChanges.find((sc) => sc.status === 'CODE-REJECTED')).toBeTruthy()
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

        // proposal-stage state (status/approvedAt/rejectedAt) stays approved; reviewerId tracks the latest decision.
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
                securityChecks: 'not-sure',
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
            securityChecks: 'not-sure',
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

    it('rejects when study.status is not PENDING-REVIEW even if the latest job is reviewable', async () => {
        // Pathological state: study moved off PENDING-REVIEW (e.g. APPROVED) but
        // the latest job is still CODE-SUBMITTED. The auth gate blocks editor
        // connections here; the action handler must match.
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
            decision: 'approve',
            feedback: validFeedback,
            criteria: validCriteria,
        })

        expect(result).toMatchObject({
            error: expect.objectContaining({ study: expect.stringMatching(/already been decided/i) }),
        })
        expect(await loadCodeReviewRows(study.id)).toHaveLength(0)
    })

    it('rejects a duplicate code-review submission for the same job', async () => {
        // First submit approves the code, which advances the job to CODE-APPROVED;
        // a second submit then fails the reviewable-state precondition rather
        // than reaching the unique index. Either guard is acceptable: the test
        // verifies that no second CODE-REVIEWER-FEEDBACK row appears.
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
            decision: 'reject',
            feedback: validFeedback,
            criteria: validCriteria,
        })

        expect(second).toMatchObject({ error: expect.objectContaining({ study: expect.any(String) }) })
        expect(await loadCodeReviewRows(study.id)).toHaveLength(1)
    })

    it('surfaces a clean ActionFailure (not raw "duplicate key") when two reviewers race past the claim', async () => {
        // Simulates the race-loser path: claimInitialCodeReviewJob passes (the
        // study/job are still in reviewable state because the winning reviewer
        // has not yet committed), but the studyReviewComment insert trips the
        // composite unique constraint on (studyJobId, reviewKind). We seed the
        // row directly to force that exact failure mode.
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
        // The pre-seeded row is the only CODE row; the action did not create a second.
        expect(await loadCodeReviewRows(study.id)).toHaveLength(1)
    })

    // OTTER-471: exercises the studyJob row lock + composite unique constraint
    // under true concurrency (Promise.all), not just the sequential case above.
    it('OTTER-471: parallel approve + reject through submit action, exactly one CODE-* terminal row', async () => {
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
                decision: 'reject',
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
        const codeRejected = await db
            .selectFrom('jobStatusChange')
            .select('id')
            .where('studyJobId', '=', job.id)
            .where('status', '=', 'CODE-REJECTED')
            .execute()
        expect(codeApproved.length + codeRejected.length).toBe(1)
    })

    it('composite unique constraint blocks two CODE review rows for the same job', async () => {
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
                })
                .execute(),
        ).rejects.toThrow(/duplicate key|unique/i)
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
    it('returns code-review rows ordered newest first and excludes proposal-review rows', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study, job } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'PENDING-REVIEW',
            jobStatus: 'CODE-SUBMITTED',
        })

        // A proposal-review row in the legacy table; getCodeReviewFeedbackAction
        // reads from studyReviewComment so this should not be returned regardless.
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
                    securityChecks: 'no',
                    privacyProtection: 'yes',
                },
                createdAt: new Date('2026-01-01T00:00:00Z'),
            })
            .returning('id')
            .executeTakeFirstOrThrow()

        // The composite unique is per (study_job_id, review_kind): simulate a
        // re-submitted job by creating a second job and writing a fresher review
        // against it.
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

    it('attaches version numbers and surfaces resubmission notes from studyJob rows', async () => {
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

        const secondJob = await db
            .insertInto('studyJob')
            .values({
                studyId: study.id,
                resubmissionNote: { root: { type: 'root', children: [{ text: 'fixed things' }] } },
            })
            .returning('id')
            .executeTakeFirstOrThrow()
        await db
            .insertInto('jobStatusChange')
            .values({ studyJobId: secondJob.id, userId: user.id, status: 'CODE-SUBMITTED' })
            .execute()

        const rows = actionResult(await getCodeReviewFeedbackAction({ studyId: study.id }))
        // newest first: the v2 resubmission note comes before the v1 reviewer decision
        expect(rows).toHaveLength(2)
        const noteRow = rows.find((r) => r.entryType === 'RESUBMISSION-NOTE')
        const feedbackRow = rows.find((r) => r.entryType === 'REVIEWER-FEEDBACK')
        expect(noteRow?.version).toBe(2)
        expect(feedbackRow?.version).toBe(1)
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

        await db
            .updateTable('studyJob')
            .set({
                createdAt: sharedCreatedAt,
                resubmissionNote: { root: { type: 'root', children: [{ text: 'fixed things' }] } },
            })
            .where('id', '=', job.id)
            .execute()

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

        const rows = actionResult(await getCodeReviewFeedbackAction({ studyId: study.id }))

        expect(rows.map((row) => row.id)).toEqual([`job-note-${job.id}`, review.id])
        expect(rows.map((row) => row.entryType)).toEqual(['RESUBMISSION-NOTE', 'REVIEWER-FEEDBACK'])
        expect(rows.map((row) => row.version)).toEqual([1, 1])
    })
})

function validCriteriaFixture() {
    return {
        proposalAlignment: 'yes',
        agreementCompliance: 'yes',
        securityChecks: 'yes',
        privacyProtection: 'yes',
    } as const
}

describe('softDeleteStudyAction', () => {
    it('soft-deletes a DRAFT study and hides it from the researcher dashboard', async () => {
        const { lab, studyId, user } = await createTestProposalDraft({
            enclaveSlug: 'soft-delete-draft-enclave',
            studyInfo: { title: 'Doomed Draft' },
        })

        // sanity: lab dashboard sees the draft before delete
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
        expect(row.status).toBe('DRAFT') // status untouched, only deletedAt set

        // lab dashboard no longer surfaces the deleted draft
        const after = await fetchStudiesForOrgAction({ orgSlug: lab.slug })
        expect(after).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: studyId })]))

        // user dashboard also drops it
        const userView = await fetchStudiesForCurrentResearcherUserAction()
        expect(Array.isArray(userView)).toBe(true)
        if (Array.isArray(userView)) {
            expect(userView.find((s) => s.id === studyId)).toBeUndefined()
        }
        // silence unused warning if user was destructured but not otherwise referenced
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

        // Different lab member — passes view/delete CASL but is not the draft author
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
