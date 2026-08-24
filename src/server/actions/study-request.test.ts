import * as aws from '@/server/aws'
import {
    actionResult,
    buildFeedback,
    cleanupWorkspaceDirs,
    createTestProposalDraft,
    createWorkspaceDir,
    db,
    expectStudyJobRecords,
    getAuditEntries,
    insertTestOrg,
    insertTestStudyData,
    insertTestStudyJobData,
    insertTestStudyOnly,
    mockSessionWithTestData,
    setTestStudyStatus,
    writeWorkspaceFiles,
} from '@/tests/unit.helpers'
import { RESUBMIT_NOTE_MAX_CHARACTERS } from '@/app/[orgSlug]/study/[studyId]/edit-and-resubmit/schema'
import { approveStudyProposalAction, submitCodeReviewDecisionAction } from '@/server/actions/study.actions'
import type { StudyJobStatus } from '@/database/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    getDraftStudyAction,
    onDeleteStudyAction,
    onSaveDraftStudyAction,
    onSubmitDraftStudyAction,
    onUpdateDraftStudyAction,
    finalizeStudySubmissionAction,
    resubmitProposalAction,
    resubmitStudyCodeAction,
    saveCodeResubmissionNoteDraftAction,
    submitStudyCodeAction,
} from '@/server/actions/study-request'
import { STUDY_TITLE_BLANK_ERROR } from '@/app/[orgSlug]/study/request/form-schemas'
import { purgeProposalYjsDocsBeforeAt } from '@/server/db/yjs-cleanup'
import { getStudyReviewForJob } from '@/server/db/queries'
import { ensureRoundJobForLaunch, ensureRoundJobForUpload } from '@/server/db/mutations'
import { lexicalJson } from '@/lib/lexical'
import { flushDeferred } from '@/tests/vitest.setup'

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

const workspaceRoots: string[] = []

// Append a status row to a job. Rows inserted later get higher v7 ids and sort ahead in statusChanges
// (createdAt desc, id desc), so this reproduces a late webhook status landing on top of the decision.
const insertStatus = (studyJobId: string, status: StudyJobStatus) =>
    db.insertInto('jobStatusChange').values({ studyJobId, status }).execute()

describe('Request Study Actions', () => {
    beforeEach(() => {
        delete process.env.CODER_FILES
    })

    afterEach(async () => {
        await cleanupWorkspaceDirs(workspaceRoots)
    })

    it('onSaveDraftStudyAction creates a draft study', async () => {
        // create the enclave that owns the data
        const enclave = await insertTestOrg({ type: 'enclave', slug: 'test-draft' })

        // create its lab counterpart
        const lab = await insertTestOrg({ slug: `${enclave.slug}-lab`, type: 'lab' })
        await mockSessionWithTestData({ orgSlug: lab.slug, orgType: 'lab' })

        const studyInfo = {
            title: 'Test Draft Study',
            piName: 'Test PI',
            language: 'R' as const,
        }

        const result = actionResult(
            await onSaveDraftStudyAction({
                orgSlug: enclave.slug,
                studyInfo,
                submittingOrgSlug: lab.slug,
            }),
        )

        expect(result.studyId).toBeDefined()

        const study = await db
            .selectFrom('study')
            .selectAll('study')
            .where('id', '=', result.studyId)
            .executeTakeFirst()
        expect(study).toBeDefined()
        expect(study?.title).toEqual(studyInfo.title)
        expect(study?.status).toEqual('DRAFT')
    })

    // OTTER-719: submittingOrgSlug is a client param and `create Study` is unconditioned by design
    // (a new draft has no submittedByOrgId yet), so the handler is the only place this can be checked.
    // Without it a caller could stamp another lab's id onto a study, handing that lab IDE access to it.
    it('onSaveDraftStudyAction rejects a submitting lab the caller does not belong to', async () => {
        const enclave = await insertTestOrg({ type: 'enclave', slug: 'foreign-submit' })
        const victimLab = await insertTestOrg({ slug: `${enclave.slug}-lab`, type: 'lab' })
        const callersLab = await insertTestOrg({ slug: 'foreign-submit-callers-lab', type: 'lab' })
        await mockSessionWithTestData({ orgSlug: callersLab.slug, orgType: 'lab' })

        const result = await onSaveDraftStudyAction({
            orgSlug: enclave.slug,
            studyInfo: { title: 'Smuggled', piName: 'PI', language: 'R' as const },
            submittingOrgSlug: victimLab.slug,
        })

        expect(result).toMatchObject({
            error: expect.objectContaining({ permission_denied: expect.any(String) }),
        })

        const smuggled = await db
            .selectFrom('study')
            .selectAll('study')
            .where('submittedByOrgId', '=', victimLab.id)
            .executeTakeFirst()
        expect(smuggled).toBeUndefined()
    })

    it('onSubmitDraftStudyAction creates job and finalizeStudySubmissionAction converts to PENDING-REVIEW', async () => {
        // create the enclave that owns the data
        const enclave = await insertTestOrg({ type: 'enclave', slug: 'test-submit' })

        // create its lab counterpart
        const lab = await insertTestOrg({ slug: `${enclave.slug}-lab`, type: 'lab' })
        await mockSessionWithTestData({ orgSlug: lab.slug, orgType: 'lab' })

        // First create a draft
        const draftResult = actionResult(
            await onSaveDraftStudyAction({
                orgSlug: enclave.slug,
                studyInfo: {
                    title: 'Test Study',
                    piName: 'Test PI',
                    language: 'R' as const,
                },
                submittingOrgSlug: lab.slug,
            }),
        )

        // Verify it's a draft
        let study = await db
            .selectFrom('study')
            .selectAll('study')
            .where('id', '=', draftResult.studyId)
            .executeTakeFirst()
        expect(study?.status).toEqual('DRAFT')

        // Submit the draft - this creates the job but doesn't change status
        const submitResult = actionResult(
            await onSubmitDraftStudyAction({
                studyId: draftResult.studyId,
                mainCodeFileName: 'main.R',
                codeFileNames: ['helpers.R'],
            }),
        )

        expect(submitResult.studyId).toEqual(draftResult.studyId)
        expect(submitResult.studyJobId).toBeDefined()

        // Verify status is still DRAFT after onSubmitDraftStudyAction
        study = await db.selectFrom('study').selectAll('study').where('id', '=', draftResult.studyId).executeTakeFirst()
        expect(study?.status).toEqual('DRAFT')

        // Finalize the submission - this changes status to PENDING-REVIEW
        actionResult(await finalizeStudySubmissionAction({ studyId: draftResult.studyId }))

        // Verify it's now PENDING-REVIEW
        study = await db.selectFrom('study').selectAll('study').where('id', '=', draftResult.studyId).executeTakeFirst()
        expect(study?.status).toEqual('PENDING-REVIEW')
    })

    it('submission flow works with Python language', async () => {
        const enclave = await insertTestOrg({ type: 'enclave', slug: 'test-python' })
        const lab = await insertTestOrg({ slug: `${enclave.slug}-lab`, type: 'lab' })
        await mockSessionWithTestData({ orgSlug: lab.slug, orgType: 'lab' })

        // Create a draft with Python
        const draftResult = actionResult(
            await onSaveDraftStudyAction({
                orgSlug: enclave.slug,
                studyInfo: {
                    title: 'Python Study',
                    piName: 'Test PI',
                    language: 'PYTHON' as const,
                },
                submittingOrgSlug: lab.slug,
            }),
        )

        // Submit the draft - creates job but doesn't change status
        const submitResult = actionResult(
            await onSubmitDraftStudyAction({
                studyId: draftResult.studyId,
                mainCodeFileName: 'main.py',
                codeFileNames: ['helpers.py'],
            }),
        )

        expect(submitResult.studyId).toBeDefined()
        expect(submitResult.studyJobId).toBeDefined()

        // Finalize the submission
        actionResult(await finalizeStudySubmissionAction({ studyId: draftResult.studyId }))

        const study = await db
            .selectFrom('study')
            .selectAll('study')
            .where('id', '=', submitResult.studyId)
            .executeTakeFirst()
        expect(study?.language).toEqual('PYTHON')
        expect(study?.status).toEqual('PENDING-REVIEW')
    })

    it('onSubmitDraftStudyAction rejects non-draft studies', async () => {
        const { org } = await mockSessionWithTestData({ orgType: 'lab' })
        // insertTestStudyData creates a study with PENDING-REVIEW status
        const { studyId } = await insertTestStudyData({ org })

        const result = await onSubmitDraftStudyAction({
            studyId,
            mainCodeFileName: 'main.R',
            codeFileNames: [],
        })

        // The action returns an error object for non-draft studies
        expect(result).toHaveProperty('error')
        expect((result as { error: string }).error).toMatch(/expected status DRAFT|not found/)
    })

    it('onDeleteStudyAction deletes a study', async () => {
        const { org } = await mockSessionWithTestData({ orgType: 'lab' })
        const { studyId } = await insertTestStudyData({ org })

        await onDeleteStudyAction({ studyId })

        const study = await db.selectFrom('study').selectAll('study').where('id', '=', studyId).executeTakeFirst()
        expect(study).toBeUndefined()

        expect(aws.deleteFolderContents).toHaveBeenCalledWith(`studies/${org.slug}/${studyId}`)
    })

    it('onDeleteStudyAction rejects a cross-lab user and leaves the study intact', async () => {
        const { org: labA } = await mockSessionWithTestData({ orgSlug: 'lab-delete-cross-A', orgType: 'lab' })
        const { studyId } = await insertTestStudyData({ org: labA })

        // A member of a different lab must not be able to delete labA's study by id.
        await mockSessionWithTestData({ orgSlug: 'lab-delete-cross-B', orgType: 'lab' })
        const result = await onDeleteStudyAction({ studyId })
        expect(result).toHaveProperty('error')

        const study = await db.selectFrom('study').select('id').where('id', '=', studyId).executeTakeFirst()
        expect(study?.id).toBe(studyId)
    })

    // DRAFT → PENDING-REVIEW is a first-time proposal submission, sends "new study proposal" email
    it('finalizeStudySubmissionAction calls onStudyCreated for DRAFT studies', async () => {
        const enclave = await insertTestOrg({ type: 'enclave', slug: 'test-evt-draft' })
        const lab = await insertTestOrg({ slug: `${enclave.slug}-lab`, type: 'lab' })
        const { user } = await mockSessionWithTestData({ orgSlug: lab.slug, orgType: 'lab' })

        const draftResult = actionResult(
            await onSaveDraftStudyAction({
                orgSlug: enclave.slug,
                studyInfo: { title: 'Draft Event Test', piName: 'PI', language: 'R' as const },
                submittingOrgSlug: lab.slug,
            }),
        )

        actionResult(await finalizeStudySubmissionAction({ studyId: draftResult.studyId }))

        const auditEntries = await getAuditEntries(draftResult.studyId, 'STUDY')

        expect(auditEntries).toContainEqual({
            eventType: 'CREATED',
            recordType: 'STUDY',
            recordId: draftResult.studyId,
            userId: user.id,
        })
        expect(auditEntries).not.toContainEqual(
            expect.objectContaining({
                eventType: 'UPDATED',
                recordId: draftResult.studyId,
            }),
        )
    })

    // Proposal finalize is proposal-stage only; code re-submission goes through
    // submitStudyCodeAction/resubmitStudyCodeAction and never re-claims the proposal.
    it('finalizeStudySubmissionAction rejects APPROVED studies', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, studyStatus: 'APPROVED' })

        const result = await finalizeStudySubmissionAction({ studyId: study.id })

        expect(result).toEqual({ error: { submission: 'Proposal has already been submitted' } })

        const unchanged = await db
            .selectFrom('study')
            .select(['status'])
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(unchanged.status).toBe('APPROVED')
    })

    // Step 1 owns study.title on a DRAFT, so submit sends no title at all and a draft predating
    // OTTER-690 can have none. `study_title_required_when_not_draft` would reject the status flip
    // as a raw DB error, so the blank has to be caught before the UPDATE runs.
    it('finalizeStudySubmissionAction rejects a DRAFT whose title was never set', async () => {
        const { studyId } = await createTestProposalDraft({ enclaveSlug: 'finalize-untitled' })
        await db.updateTable('study').set({ title: null }).where('id', '=', studyId).execute()

        const result = await finalizeStudySubmissionAction({ studyId })

        expect(result).toEqual({ error: { title: STUDY_TITLE_BLANK_ERROR } })

        const unchanged = await db
            .selectFrom('study')
            .select(['status'])
            .where('id', '=', studyId)
            .executeTakeFirstOrThrow()
        expect(unchanged.status).toBe('DRAFT')
    })

    describe('OpenStax Proposal Flow (Step 2)', () => {
        it('creates draft with step 1 fields, updates with proposal fields, and submits', async () => {
            const enclave = await insertTestOrg({ type: 'enclave', slug: 'test-openstax-flow' })
            const lab = await insertTestOrg({ slug: `${enclave.slug}-lab`, type: 'lab' })
            await mockSessionWithTestData({ orgSlug: lab.slug, orgType: 'lab' })

            // Step 1: create the draft. OTTER-690 made the title part of this step, so creation
            // carries one from the start rather than acquiring it later in Step 2.
            const draftResult = actionResult(
                await onSaveDraftStudyAction({
                    orgSlug: enclave.slug,
                    studyInfo: {
                        title: 'Set on Step 1',
                        language: 'PYTHON' as const,
                    },
                    submittingOrgSlug: lab.slug,
                }),
            )

            expect(draftResult.studyId).toBeDefined()

            let study = await db
                .selectFrom('study')
                .selectAll('study')
                .where('id', '=', draftResult.studyId)
                .executeTakeFirst()
            expect(study?.status).toEqual('DRAFT')
            expect(study?.language).toEqual('PYTHON')
            expect(study?.title).toEqual('Set on Step 1')

            // Step 2: Update with proposal fields
            const proposalFields = {
                title: 'Impact of Highlighting on Learning',
                piName: 'Dr. Research Lead',
                datasets: ['openstax-calculus', 'openstax-physics'],
                researchQuestions: lexicalJson('How does highlighting affect retention?'),
                projectSummary: lexicalJson('This study examines highlighting patterns.'),
                impact: lexicalJson('Findings will inform textbook design.'),
                additionalNotes: lexicalJson('Timeline is Q1 2025.'),
            }

            actionResult(
                await onUpdateDraftStudyAction({
                    studyId: draftResult.studyId,
                    studyInfo: proposalFields,
                }),
            )

            // Verify proposal fields saved
            study = await db
                .selectFrom('study')
                .selectAll('study')
                .where('id', '=', draftResult.studyId)
                .executeTakeFirst()
            expect(study?.title).toEqual(proposalFields.title)
            expect(study?.piName).toEqual(proposalFields.piName)
            expect(study?.datasets).toEqual(proposalFields.datasets)
            expect(study?.researchQuestions).toEqual(JSON.parse(proposalFields.researchQuestions))
            expect(study?.projectSummary).toEqual(JSON.parse(proposalFields.projectSummary))
            expect(study?.impact).toEqual(JSON.parse(proposalFields.impact))
            expect(study?.additionalNotes).toEqual(JSON.parse(proposalFields.additionalNotes))
            expect(study?.status).toEqual('DRAFT')

            // Step 3: Finalize submission (no code upload in OpenStax flow)
            actionResult(await finalizeStudySubmissionAction({ studyId: draftResult.studyId }))

            // Verify final state
            study = await db
                .selectFrom('study')
                .selectAll('study')
                .where('id', '=', draftResult.studyId)
                .executeTakeFirst()
            expect(study?.status).toEqual('PENDING-REVIEW')
        })
    })

    describe('Multi-user proposal collaboration (OTTER-497)', () => {
        it('finalizeStudySubmissionAction returns submitterFullName and DO orgName', async () => {
            const { enclave, studyId } = await createTestProposalDraft({
                enclaveSlug: 'test-otter-497-meta',
                studyInfo: { title: 'Meta' },
            })

            const result = actionResult(await finalizeStudySubmissionAction({ studyId }))

            expect(typeof result.submitterFullName).toBe('string')
            expect(result.submitterFullName.length).toBeGreaterThan(0)
            expect(result.orgName).toBe(enclave.name)
        })

        it('finalizeStudySubmissionAction is first-submit-wins: second concurrent caller fails', async () => {
            const { studyId } = await createTestProposalDraft({
                enclaveSlug: 'test-otter-497-race',
                studyInfo: { title: 'Race' },
            })

            const [first, second] = await Promise.all([
                finalizeStudySubmissionAction({ studyId }),
                finalizeStudySubmissionAction({ studyId }),
            ])

            const successes = [first, second].filter((r) => !('error' in r))
            const failures = [first, second].filter((r) => 'error' in r)

            expect(successes).toHaveLength(1)
            expect(failures).toHaveLength(1)
            expect((failures[0] as { error: unknown }).error).toMatchObject({
                submission: expect.stringMatching(/already been submitted/i),
            })

            const study = await db
                .selectFrom('study')
                .selectAll('study')
                .where('id', '=', studyId)
                .executeTakeFirstOrThrow()
            expect(study.status).toBe('PENDING-REVIEW')
        })

        it('finalizeStudySubmissionAction transitions CHANGE-REQUESTED → PENDING-REVIEW', async () => {
            const { org } = await mockSessionWithTestData({ orgType: 'lab' })
            const { study } = await insertTestStudyOnly({ org })

            // Force the test study into CHANGE-REQUESTED status (insertTestStudyOnly defaults to APPROVED)
            await setTestStudyStatus(study.id, 'CHANGE-REQUESTED')

            const result = actionResult(await finalizeStudySubmissionAction({ studyId: study.id }))
            expect(result.studyId).toBe(study.id)

            const updated = await db
                .selectFrom('study')
                .select(['status'])
                .where('id', '=', study.id)
                .executeTakeFirstOrThrow()
            expect(updated.status).toBe('PENDING-REVIEW')
        })

        it('finalizeStudySubmissionAction rejects callers outside the submitting lab', async () => {
            const enclave = await insertTestOrg({ type: 'enclave', slug: 'test-otter-497-cross-lab' })
            const labA = await insertTestOrg({ slug: `${enclave.slug}-lab-a`, type: 'lab' })
            const labB = await insertTestOrg({ slug: `${enclave.slug}-lab-b`, type: 'lab' })

            // Lab A user creates the draft.
            await mockSessionWithTestData({ orgSlug: labA.slug, orgType: 'lab' })
            const draftResult = actionResult(
                await onSaveDraftStudyAction({
                    orgSlug: enclave.slug,
                    studyInfo: { title: 'Cross-lab', piName: 'PI', language: 'R' as const },
                    submittingOrgSlug: labA.slug,
                }),
            )

            // Lab B user (no membership in lab A) tries to finalize.
            await mockSessionWithTestData({ orgSlug: labB.slug, orgType: 'lab' })
            const result = await finalizeStudySubmissionAction({ studyId: draftResult.studyId })

            expect(result).toHaveProperty('error')
            const study = await db
                .selectFrom('study')
                .select(['status'])
                .where('id', '=', draftResult.studyId)
                .executeTakeFirstOrThrow()
            expect(study.status).toBe('DRAFT')
        })

        it('finalizeStudySubmissionAction deletes proposal-* yjs_document rows so re-edit reseeds from study columns', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
            await setTestStudyStatus(study.id, 'DRAFT')

            // Simulate Hocuspocus-persisted Y.Doc rows accumulated during the editing session.
            await db
                .insertInto('yjsDocument')
                .values([
                    {
                        name: `proposal-${study.id}-fields`,
                        studyId: study.id,
                        data: Buffer.from([0]),
                    },
                    {
                        name: `proposal-${study.id}-research-questions`,
                        studyId: study.id,
                        data: Buffer.from([0]),
                    },
                    {
                        name: `review-feedback-${study.id}-v1`,
                        studyId: study.id,
                        data: Buffer.from([0]),
                    },
                ])
                .execute()

            actionResult(await finalizeStudySubmissionAction({ studyId: study.id }))

            const remaining = await db
                .selectFrom('yjsDocument')
                .select(['name'])
                .where('studyId', '=', study.id)
                .execute()
            const remainingNames = remaining.map((r) => r.name).sort()
            // Proposal docs gone; review-feedback row untouched (DO submit owns that one).
            expect(remainingNames).toEqual([`review-feedback-${study.id}-v1`])
        })

        it('purgeProposalYjsDocsBeforeAt deletes only rows whose updatedAt predates the bound', async () => {
            const { org } = await mockSessionWithTestData({ orgType: 'lab' })
            const { study } = await insertTestStudyOnly({ org })

            const before = new Date('2026-01-01T00:00:00Z')
            const after = new Date('2026-01-01T00:00:10Z')

            // Stale row from before the captured submit timestamp; should be deleted.
            await db
                .insertInto('yjsDocument')
                .values({
                    name: `proposal-${study.id}-fields`,
                    studyId: study.id,
                    data: Buffer.from([0]),
                    updatedAt: before,
                })
                .execute()

            // Fresh row from a fast reopen-and-edit cycle; should survive the bounded purge.
            await db
                .insertInto('yjsDocument')
                .values({
                    name: `proposal-${study.id}-research-questions`,
                    studyId: study.id,
                    data: Buffer.from([0]),
                    updatedAt: after,
                })
                .execute()

            await purgeProposalYjsDocsBeforeAt(db, { studyId: study.id, beforeAt: before })

            const remaining = await db
                .selectFrom('yjsDocument')
                .select(['name'])
                .where('studyId', '=', study.id)
                .execute()
            expect(remaining.map((r) => r.name)).toEqual([`proposal-${study.id}-research-questions`])
        })

        it('onUpdateDraftStudyAction allows another lab member to edit a CHANGE-REQUESTED draft', async () => {
            const { lab, studyId } = await createTestProposalDraft({
                enclaveSlug: 'test-otter-497-coauthor',
                studyInfo: { title: 'Original' },
            })

            await setTestStudyStatus(studyId, 'CHANGE-REQUESTED')

            // Second user in the same lab updates the draft. mockSessionWithTestData
            // creates a fresh user; the lab-membership middleware should allow the edit.
            await mockSessionWithTestData({ orgSlug: lab.slug, orgType: 'lab' })

            actionResult(
                await onUpdateDraftStudyAction({
                    studyId,
                    studyInfo: { title: 'Coauthored', piName: 'PI', language: 'R' as const },
                }),
            )

            const updated = await db
                .selectFrom('study')
                .select(['title', 'status'])
                .where('id', '=', studyId)
                .executeTakeFirstOrThrow()
            expect(updated.title).toBe('Coauthored')
            expect(updated.status).toBe('CHANGE-REQUESTED')
        })

        it('onUpdateDraftStudyAction allows another lab member to edit a DRAFT', async () => {
            const { lab, studyId } = await createTestProposalDraft({
                enclaveSlug: 'test-otter-497-draft-coauthor',
                studyInfo: { title: 'Original DRAFT' },
            })

            // Second user in the same lab.
            await mockSessionWithTestData({ orgSlug: lab.slug, orgType: 'lab' })
            actionResult(
                await onUpdateDraftStudyAction({
                    studyId,
                    studyInfo: { title: 'Coauthored DRAFT', piName: 'PI', language: 'R' as const },
                }),
            )

            const updated = await db
                .selectFrom('study')
                .select(['title', 'status'])
                .where('id', '=', studyId)
                .executeTakeFirstOrThrow()
            expect(updated.title).toBe('Coauthored DRAFT')
            expect(updated.status).toBe('DRAFT')
        })

        it('onUpdateDraftStudyAction rejects a cross-lab user on DRAFT', async () => {
            const { enclave, studyId } = await createTestProposalDraft({
                enclaveSlug: 'test-otter-497-update-cross-draft',
                studyInfo: { title: 'LabA Draft' },
            })
            const labB = await insertTestOrg({ slug: `${enclave.slug}-lab-b`, type: 'lab' })

            await mockSessionWithTestData({ orgSlug: labB.slug, orgType: 'lab' })
            const result = await onUpdateDraftStudyAction({
                studyId,
                studyInfo: { title: 'Hijacked', piName: 'PI', language: 'R' as const },
            })
            expect(result).toHaveProperty('error')

            const after = await db
                .selectFrom('study')
                .select(['title'])
                .where('id', '=', studyId)
                .executeTakeFirstOrThrow()
            expect(after.title).toBe('LabA Draft')
        })

        it('onUpdateDraftStudyAction rejects a cross-lab user on CHANGE-REQUESTED', async () => {
            const { enclave, studyId } = await createTestProposalDraft({
                enclaveSlug: 'test-otter-497-update-cross-cr',
                studyInfo: { title: 'LabA Draft' },
            })
            const labB = await insertTestOrg({ slug: `${enclave.slug}-lab-b`, type: 'lab' })
            await setTestStudyStatus(studyId, 'CHANGE-REQUESTED')

            await mockSessionWithTestData({ orgSlug: labB.slug, orgType: 'lab' })
            const result = await onUpdateDraftStudyAction({
                studyId,
                studyInfo: { title: 'Hijacked', piName: 'PI', language: 'R' as const },
            })
            expect(result).toHaveProperty('error')

            const after = await db
                .selectFrom('study')
                .select(['title', 'status'])
                .where('id', '=', studyId)
                .executeTakeFirstOrThrow()
            expect(after.title).toBe('LabA Draft')
            expect(after.status).toBe('CHANGE-REQUESTED')
        })
    })

    // OTTER-690, OTTER-737: the cap belongs to the actions that submit, not to `draftStudyApiSchema`.
    // A study created before the cap existed can hold a longer title, and the resubmit autosave runs
    // through onUpdateDraftStudyAction: rejecting that payload in `.params()` would fail every
    // autosave on a page the researcher opened to edit something else entirely.
    describe('study title length rules (OTTER-690, OTTER-737)', () => {
        const OVER_LIMIT = 'a'.repeat(61)

        it('onSaveDraftStudyAction rejects a title over 60 characters', async () => {
            const enclave = await insertTestOrg({ type: 'enclave', slug: 'title-cap-create-enclave' })
            const lab = await insertTestOrg({ slug: 'title-cap-create-lab', type: 'lab' })
            await mockSessionWithTestData({ orgSlug: lab.slug, orgType: 'lab' })

            const result = await onSaveDraftStudyAction({
                orgSlug: enclave.slug,
                submittingOrgSlug: lab.slug,
                studyInfo: { title: OVER_LIMIT, language: 'R' as const },
            })

            expect('error' in result).toBe(true)
        })

        // Creation is the only entry point that mints a row, so it is the only one that can stop an
        // untitled study existing. Rows predating OTTER-690 still need the /proposal and finalize
        // guards; this stops new ones joining them.
        it('onSaveDraftStudyAction rejects a create with no usable title', async () => {
            const enclave = await insertTestOrg({ type: 'enclave', slug: 'title-required-enclave' })
            const lab = await insertTestOrg({ slug: 'title-required-lab', type: 'lab' })
            await mockSessionWithTestData({ orgSlug: lab.slug, orgType: 'lab' })

            const blank = await onSaveDraftStudyAction({
                orgSlug: enclave.slug,
                submittingOrgSlug: lab.slug,
                studyInfo: { title: '   ', language: 'R' as const },
            })
            expect('error' in blank).toBe(true)

            const untitled = await db
                .selectFrom('study')
                .select('id')
                .where('submittedByOrgId', '=', lab.id)
                .executeTakeFirst()
            expect(untitled).toBeUndefined()
        })

        // CASL denies a cross-lab caller before the handler runs, so what this pins is the
        // CASL-level outcome rather than the handler's check ordering: the refusal carries no
        // title-specific message, tells the caller nothing about the stored title, and writes
        // nothing. The last assertion matters because requireAbilityTo serializes the ability
        // subject into the message it returns, so anything the middleware reads goes back to a
        // caller who was just refused.
        it('onUpdateDraftStudyAction rejects a cross-lab update without disclosing the stored title', async () => {
            const { enclave, studyId } = await createTestProposalDraft({
                enclaveSlug: 'title-cap-cross-lab',
                studyInfo: { title: 'LabA Draft' },
            })
            const labB = await insertTestOrg({ slug: `${enclave.slug}-lab-b`, type: 'lab' })
            await mockSessionWithTestData({ orgSlug: labB.slug, orgType: 'lab' })

            const result = await onUpdateDraftStudyAction({ studyId, studyInfo: { title: OVER_LIMIT } })

            expect(result).toHaveProperty('error')
            expect(result).not.toMatchObject({ error: expect.objectContaining({ title: expect.any(String) }) })
            expect(JSON.stringify(result)).not.toContain('LabA Draft')

            const after = await db
                .selectFrom('study')
                .select(['title'])
                .where('id', '=', studyId)
                .executeTakeFirstOrThrow()
            expect(after.title).toBe('LabA Draft')
        })

        it('onSaveDraftStudyAction accepts a title at exactly 60 characters', async () => {
            const enclave = await insertTestOrg({ type: 'enclave', slug: 'title-cap-ok-enclave' })
            const lab = await insertTestOrg({ slug: 'title-cap-ok-lab', type: 'lab' })
            await mockSessionWithTestData({ orgSlug: lab.slug, orgType: 'lab' })

            const { studyId } = actionResult(
                await onSaveDraftStudyAction({
                    orgSlug: enclave.slug,
                    submittingOrgSlug: lab.slug,
                    studyInfo: { title: 'b'.repeat(60), language: 'R' as const },
                }),
            )

            const study = await db
                .selectFrom('study')
                .select('title')
                .where('id', '=', studyId)
                .executeTakeFirstOrThrow()
            expect(study.title).toBe('b'.repeat(60))
        })

        it('onUpdateDraftStudyAction rejects an over-limit title on a DRAFT row', async () => {
            const { lab, studyId } = await createTestProposalDraft({ enclaveSlug: 'title-cap-update-draft' })
            await mockSessionWithTestData({ orgSlug: lab.slug, orgType: 'lab' })

            const result = await onUpdateDraftStudyAction({ studyId, studyInfo: { title: OVER_LIMIT } })

            expect('error' in result).toBe(true)
            const study = await db
                .selectFrom('study')
                .select('title')
                .where('id', '=', studyId)
                .executeTakeFirstOrThrow()
            expect(study.title).toBe('Test draft')
        })

        // The resubmit autosave writes through this same action, and the row it saves can predate
        // the cap. Blocking it here would strand the whole page: `saveDraft()` returning false is
        // what makes the resubmit footer's Back and "View as reviewer" buttons no-ops.
        it('onUpdateDraftStudyAction accepts an over-limit title on a CHANGE-REQUESTED row', async () => {
            const { lab, studyId } = await createTestProposalDraft({ enclaveSlug: 'title-cap-update-cr' })
            await setTestStudyStatus(studyId, 'CHANGE-REQUESTED')
            await mockSessionWithTestData({ orgSlug: lab.slug, orgType: 'lab' })

            actionResult(await onUpdateDraftStudyAction({ studyId, studyInfo: { title: OVER_LIMIT } }))

            const study = await db
                .selectFrom('study')
                .select('title')
                .where('id', '=', studyId)
                .executeTakeFirstOrThrow()
            expect(study.title).toBe(OVER_LIMIT)
        })

        // The regression this split exists to prevent: a pre-cap title must not block a save of the
        // fields the researcher actually came to edit.
        it('onUpdateDraftStudyAction saves other fields on a row whose stored title predates the cap', async () => {
            const { lab, studyId } = await createTestProposalDraft({ enclaveSlug: 'title-cap-legacy-row' })
            await db.updateTable('study').set({ title: OVER_LIMIT }).where('id', '=', studyId).execute()
            await setTestStudyStatus(studyId, 'CHANGE-REQUESTED')
            await mockSessionWithTestData({ orgSlug: lab.slug, orgType: 'lab' })

            actionResult(
                await onUpdateDraftStudyAction({
                    studyId,
                    studyInfo: { title: OVER_LIMIT, projectSummary: lexicalJson('Revised summary') },
                }),
            )

            const study = await db
                .selectFrom('study')
                .select(['title', 'projectSummary'])
                .where('id', '=', studyId)
                .executeTakeFirstOrThrow()
            expect(study.projectSummary).toEqual(JSON.parse(lexicalJson('Revised summary')))
            expect(study.title).toBe(OVER_LIMIT)
        })

        it('resubmitProposalAction rejects an over-limit title', async () => {
            const { lab, studyId } = await createTestProposalDraft({ enclaveSlug: 'title-cap-resubmit' })
            await setTestStudyStatus(studyId, 'CHANGE-REQUESTED')
            const { user } = await mockSessionWithTestData({ orgSlug: lab.slug, orgType: 'lab' })

            const result = await resubmitProposalAction({
                studyId,
                studyInfo: { title: OVER_LIMIT, piName: 'PI', piUserId: user.id },
                resubmissionNote: buildFeedback(20),
            })

            expect('error' in result).toBe(true)
        })

        it('finalizeStudySubmissionAction rejects an over-limit title', async () => {
            const { lab, studyId } = await createTestProposalDraft({ enclaveSlug: 'title-cap-finalize' })
            await mockSessionWithTestData({ orgSlug: lab.slug, orgType: 'lab' })

            const result = await finalizeStudySubmissionAction({ studyId, studyInfo: { title: OVER_LIMIT } })

            expect('error' in result).toBe(true)
            const study = await db
                .selectFrom('study')
                .select('status')
                .where('id', '=', studyId)
                .executeTakeFirstOrThrow()
            expect(study.status).toBe('DRAFT')
        })

        it('accepts a title only pushed over the cap by whitespace at its ends', async () => {
            const { lab, studyId } = await createTestProposalDraft({ enclaveSlug: 'title-cap-whitespace' })
            await mockSessionWithTestData({ orgSlug: lab.slug, orgType: 'lab' })

            actionResult(await onUpdateDraftStudyAction({ studyId, studyInfo: { title: `  ${'d'.repeat(60)}  ` } }))

            const study = await db
                .selectFrom('study')
                .select('title')
                .where('id', '=', studyId)
                .executeTakeFirstOrThrow()
            expect(study.title).toBe('d'.repeat(60))
        })

        it('resubmitProposalAction rejects a resubmission note over the cap', async () => {
            const { lab, studyId } = await createTestProposalDraft({ enclaveSlug: 'note-cap-resubmit' })
            await setTestStudyStatus(studyId, 'CHANGE-REQUESTED')
            const { user } = await mockSessionWithTestData({ orgSlug: lab.slug, orgType: 'lab' })

            const result = await resubmitProposalAction({
                studyId,
                studyInfo: { title: 'Fine title', piName: 'PI', piUserId: user.id },
                resubmissionNote: 'x'.repeat(RESUBMIT_NOTE_MAX_CHARACTERS + 1),
            })

            expect('error' in result).toBe(true)
            const study = await db
                .selectFrom('study')
                .select('status')
                .where('id', '=', studyId)
                .executeTakeFirstOrThrow()
            expect(study.status).toBe('CHANGE-REQUESTED')
        })

        it('resubmitProposalAction accepts a resubmission note at exactly the cap', async () => {
            const { lab, studyId } = await createTestProposalDraft({ enclaveSlug: 'note-cap-resubmit-ok' })
            await setTestStudyStatus(studyId, 'CHANGE-REQUESTED')
            const { user } = await mockSessionWithTestData({ orgSlug: lab.slug, orgType: 'lab' })

            actionResult(
                await resubmitProposalAction({
                    studyId,
                    studyInfo: { title: 'Fine title', piName: 'PI', piUserId: user.id },
                    resubmissionNote: `  ${'x'.repeat(RESUBMIT_NOTE_MAX_CHARACTERS)}  `,
                }),
            )

            const study = await db
                .selectFrom('study')
                .select('status')
                .where('id', '=', studyId)
                .executeTakeFirstOrThrow()
            expect(study.status).toBe('PENDING-REVIEW')
        })

        it('resubmitProposalAction accepts a title at exactly 60 characters', async () => {
            const { lab, studyId } = await createTestProposalDraft({ enclaveSlug: 'title-cap-resubmit-ok' })
            await setTestStudyStatus(studyId, 'CHANGE-REQUESTED')
            const { user } = await mockSessionWithTestData({ orgSlug: lab.slug, orgType: 'lab' })
            const atLimit = 'c'.repeat(60)

            actionResult(
                await resubmitProposalAction({
                    studyId,
                    studyInfo: { title: atLimit, piName: 'PI', piUserId: user.id },
                    resubmissionNote: buildFeedback(20),
                }),
            )

            const study = await db
                .selectFrom('study')
                .select('title')
                .where('id', '=', studyId)
                .executeTakeFirstOrThrow()
            expect(study.title).toBe(atLimit)
        })
    })

    describe('getDraftStudyAction (OTTER-497)', () => {
        it('returns the draft for the original creator on DRAFT and CHANGE-REQUESTED', async () => {
            const { lab, studyId } = await createTestProposalDraft({
                enclaveSlug: 'getdraft-creator-enclave',
                studyInfo: { title: 'Creator Draft', piName: 'Dr. PI' },
            })

            const onDraft = actionResult(await getDraftStudyAction({ studyId }))
            expect(onDraft.id).toBe(studyId)
            expect(onDraft.title).toBe('Creator Draft')
            expect(onDraft.status).toBe('DRAFT')
            expect(onDraft.submittedByOrgId).toBe(lab.id)
            expect(typeof onDraft.researcherName).toBe('string')

            await setTestStudyStatus(studyId, 'CHANGE-REQUESTED')

            const onChangeRequested = actionResult(await getDraftStudyAction({ studyId }))
            expect(onChangeRequested.id).toBe(studyId)
            expect(onChangeRequested.status).toBe('CHANGE-REQUESTED')
        })

        it('returns the draft for a different lab teammate', async () => {
            const { lab, studyId } = await createTestProposalDraft({
                enclaveSlug: 'getdraft-teammate-enclave',
                studyInfo: { title: 'Teammate Draft' },
            })

            // Switch to a different user in the same lab.
            await mockSessionWithTestData({ orgSlug: lab.slug, orgType: 'lab' })
            const onDraft = actionResult(await getDraftStudyAction({ studyId }))
            expect(onDraft.id).toBe(studyId)
            expect(onDraft.status).toBe('DRAFT')

            await setTestStudyStatus(studyId, 'CHANGE-REQUESTED')

            const onChangeRequested = actionResult(await getDraftStudyAction({ studyId }))
            expect(onChangeRequested.id).toBe(studyId)
            expect(onChangeRequested.status).toBe('CHANGE-REQUESTED')
        })

        it('rejects a user outside the submitting lab', async () => {
            const { enclave, studyId } = await createTestProposalDraft({
                enclaveSlug: 'getdraft-cross-enclave',
                studyInfo: { title: 'LabA Draft' },
            })
            const labB = await insertTestOrg({ slug: `${enclave.slug}-lab-b`, type: 'lab' })

            await mockSessionWithTestData({ orgSlug: labB.slug, orgType: 'lab' })
            const result = await getDraftStudyAction({ studyId })
            const permissionDenied = (result as { error: { permission_denied: string } }).error.permission_denied
            expect(permissionDenied).toContain('in getDraftStudyAction action; cannot view Study.')
            expect(permissionDenied).toContain(`"studyId": "${studyId}"`)
        })

        it('rejects studies whose status is not in DRAFT/CHANGE-REQUESTED/APPROVED', async () => {
            const { studyId } = await createTestProposalDraft({
                enclaveSlug: 'getdraft-pending-enclave',
                studyInfo: { title: 'Soon-PR' },
            })

            await setTestStudyStatus(studyId, 'PENDING-REVIEW')

            const result = await getDraftStudyAction({ studyId })
            expect(result).toEqual({ error: { user: 'Draft study was not found' } })
        })
    })

    describe('submitStudyCodeAction', () => {
        it('creates job files, uploads workspace files, and leaves the study APPROVED', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
            const root = await createWorkspaceDir('submit-ide')
            workspaceRoots.push(root)
            await writeWorkspaceFiles(root, study.id, {
                'main.R': 'print("main")',
                'helper.R': 'print("helper")',
            })

            const result = actionResult(
                await submitStudyCodeAction({
                    studyId: study.id,
                    mainFileName: 'main.R',
                    fileNames: ['main.R', 'helper.R'],
                }),
            )

            expect(result.studyJobId).toBeDefined()

            const updatedStudy = await db
                .selectFrom('study')
                .select(['status', 'submittedAt'])
                .where('id', '=', study.id)
                .executeTakeFirstOrThrow()
            expect(updatedStudy.status).toBe('APPROVED')
            expect(updatedStudy.submittedAt).toEqual(study.submittedAt)

            await expectStudyJobRecords(study.id, [
                { name: 'main.R', fileType: 'MAIN-CODE' },
                { name: 'helper.R', fileType: 'SUPPLEMENTAL-CODE' },
            ])

            expect(aws.storeS3File).toHaveBeenCalledTimes(2)
        })

        it('rejects a main file that is not in the workspace file list', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
            const root = await createWorkspaceDir('submit-ide-reject')
            workspaceRoots.push(root)
            await writeWorkspaceFiles(root, study.id, {
                'helper.R': 'print("helper")',
            })

            const result = await submitStudyCodeAction({
                studyId: study.id,
                mainFileName: 'main.R',
                fileNames: ['helper.R'],
            })

            expect(result).toHaveProperty('error')
            expect((result as { error: string }).error).toContain('Main file not in file list')
        })
    })

    // OTTER-601: one studyJob per submission round. Launch/upload opens the round's job; submit
    // fills that same job in rather than minting a second that would mask the real submission.
    describe('one-job-per-round (OTTER-601)', () => {
        const jobCount = (studyId: string) =>
            db
                .selectFrom('studyJob')
                .select((eb) => eb.fn.countAll<number>().as('n'))
                .where('studyId', '=', studyId)
                .executeTakeFirstOrThrow()
                .then((r) => Number(r.n))

        const codeFilesFor = async (studyId: string) => {
            const job = await db
                .selectFrom('studyJob')
                .select('id')
                .where('studyId', '=', studyId)
                .orderBy('createdAt', 'desc')
                .orderBy('id', 'desc')
                .executeTakeFirstOrThrow()
            return db
                .selectFrom('studyJobFile')
                .select(['name', 'fileType'])
                .where('studyJobId', '=', job.id)
                .where('fileType', 'in', ['MAIN-CODE', 'SUPPLEMENTAL-CODE'])
                .orderBy('name')
                .execute()
        }

        const submittedStatusCount = (studyId: string) =>
            db
                .selectFrom('studyJob')
                .innerJoin('jobStatusChange', 'jobStatusChange.studyJobId', 'studyJob.id')
                .select((eb) => eb.fn.countAll<number>().as('n'))
                .where('studyJob.studyId', '=', studyId)
                .where('jobStatusChange.status', '=', 'CODE-SUBMITTED')
                .executeTakeFirstOrThrow()
                .then((r) => Number(r.n))

        const submitCode = (studyId: string, root: string, files: Record<string, string>, mainFileName: string) =>
            writeWorkspaceFiles(root, studyId, files).then(() =>
                actionResult(submitStudyCodeAction({ studyId, mainFileName, fileNames: Object.keys(files) })),
            )

        it('submit fills in the launch job instead of creating a second job', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
            const root = await createWorkspaceDir('reuse-fill')
            workspaceRoots.push(root)

            // IDE launch opens the round's job
            await ensureRoundJobForLaunch(db, study.id)
            expect(await jobCount(study.id)).toBe(1)
            const launchJob = await db
                .selectFrom('studyJob')
                .select('id')
                .where('studyId', '=', study.id)
                .executeTakeFirstOrThrow()

            await submitCode(study.id, root, { 'main.R': 'print(1)', 'helper.R': 'print(2)' }, 'main.R')

            // still one job — the launch job, now carrying the submission
            expect(await jobCount(study.id)).toBe(1)
            const afterJob = await db
                .selectFrom('studyJob')
                .select('id')
                .where('studyId', '=', study.id)
                .executeTakeFirstOrThrow()
            expect(afterJob.id).toBe(launchJob.id)
            expect(await codeFilesFor(study.id)).toEqual([
                { name: 'helper.R', fileType: 'SUPPLEMENTAL-CODE' },
                { name: 'main.R', fileType: 'MAIN-CODE' },
            ])
            expect(await submittedStatusCount(study.id)).toBe(1)
        })

        it('re-submitting before review overwrites files on the same job (no new job, no new version)', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
            const root = await createWorkspaceDir('reuse-overwrite')
            workspaceRoots.push(root)

            await ensureRoundJobForLaunch(db, study.id)
            await submitCode(study.id, root, { 'main.R': 'v1', 'helper.R': 'v1' }, 'main.R')
            vi.mocked(aws.deleteFolderContents).mockClear()

            // second submit drops helper.R, adds extra.R
            await submitCode(study.id, root, { 'main.R': 'v2', 'extra.R': 'v2' }, 'main.R')

            expect(await jobCount(study.id)).toBe(1)
            expect(await codeFilesFor(study.id)).toEqual([
                { name: 'extra.R', fileType: 'SUPPLEMENTAL-CODE' },
                { name: 'main.R', fileType: 'MAIN-CODE' },
            ])
            // old S3 code objects cleared before re-upload
            expect(aws.deleteFolderContents).toHaveBeenCalledTimes(1)
            // still a single submission/version
            expect(await submittedStatusCount(study.id)).toBe(1)
        })

        it('resubmitting after change-requested REUSES the round job (same job, second submission)', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
            const root = await createWorkspaceDir('reuse-resubmit')
            workspaceRoots.push(root)

            await ensureRoundJobForLaunch(db, study.id)
            await submitCode(study.id, root, { 'main.R': 'round1' }, 'main.R')
            // The submit fires a deferred CODE-SCANNED insert; drain it before recording the reviewer's
            // CODE-CHANGES-REQUESTED so the time-ordered v7 ids reflect that real-world order (scan, then
            // decision). Otherwise the scan can race in afterwards and become the "latest" status.
            await flushDeferred()
            const round1Job = await db
                .selectFrom('studyJob')
                .select('id')
                .where('studyId', '=', study.id)
                .executeTakeFirstOrThrow()
            await db
                .insertInto('jobStatusChange')
                .values({ studyJobId: round1Job.id, status: 'CODE-CHANGES-REQUESTED' })
                .execute()

            await writeWorkspaceFiles(root, study.id, { 'main.R': 'round2' })
            actionResult(
                await resubmitStudyCodeAction({
                    studyId: study.id,
                    mainFileName: 'main.R',
                    fileNames: ['main.R'],
                    resubmissionNote: 'addressed the feedback and updated the code',
                }),
            )

            // CR resubmit reuses the existing job — no new job is opened until FILES-APPROVED/REJECTED.
            // markCodeSubmitted is round-aware: the CODE-CHANGES-REQUESTED opened a new round, so the
            // resubmit appends a SECOND CODE-SUBMITTED on the same job (count = 2). This is what flips
            // count-based liveness back to "under review" so the researcher leaves the feedback screen.
            expect(await jobCount(study.id)).toBe(1)
            expect(await submittedStatusCount(study.id)).toBe(2)

            // The note records the round it opened (study-wide submission version) so the reviewer's
            // feedback panel labels it v2, matching the round-2 decision (OTTER-638).
            const jobAfter = await db
                .selectFrom('studyJob')
                .select(['resubmissionNote', 'resubmissionRound'])
                .where('id', '=', round1Job.id)
                .executeTakeFirstOrThrow()
            expect(jobAfter.resubmissionNote).not.toBeNull()
            expect(jobAfter.resubmissionRound).toBe(2)
        })

        // Regression: in the real flow the researcher uploads files on the resubmit page *before*
        // submitting. Under the new model ensureRoundJobForUpload REUSES the existing job (no new
        // round job is minted on CR). The resubmit must still succeed and append a second
        // CODE-SUBMITTED to the same job.
        it('resubmit succeeds after a file upload reuses the round job (no new job on CR upload)', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
            const root = await createWorkspaceDir('reuse-resubmit-upload')
            workspaceRoots.push(root)

            await ensureRoundJobForLaunch(db, study.id)
            await submitCode(study.id, root, { 'main.R': 'round1' }, 'main.R')
            // The submit fires a deferred CODE-SCANNED insert; drain it before recording the reviewer's
            // CODE-CHANGES-REQUESTED so the time-ordered v7 ids reflect that real-world order (scan, then
            // decision). Otherwise the scan can race in afterwards and become the "latest" status.
            await flushDeferred()
            const round1Job = await db
                .selectFrom('studyJob')
                .select('id')
                .where('studyId', '=', study.id)
                .executeTakeFirstOrThrow()
            await db
                .insertInto('jobStatusChange')
                .values({ studyJobId: round1Job.id, status: 'CODE-CHANGES-REQUESTED' })
                .execute()

            // Researcher uploads a file on the resubmit page → reuses the existing round job (no new job).
            await ensureRoundJobForUpload(db, study.id)
            expect(await jobCount(study.id)).toBe(1)

            await writeWorkspaceFiles(root, study.id, { 'main.R': 'round2' })
            const result = await resubmitStudyCodeAction({
                studyId: study.id,
                mainFileName: 'main.R',
                fileNames: ['main.R'],
                resubmissionNote: 'addressed the feedback and updated the code',
            })

            expect(result).not.toHaveProperty('error')
            // Still one job — reused throughout. markCodeSubmitted is round-aware: round 1's
            // CODE-SUBMITTED + the reviewer's CODE-CHANGES-REQUESTED opened round 2, so the resubmit
            // appends a second CODE-SUBMITTED on the same job (count = 2).
            expect(await jobCount(study.id)).toBe(1)
            expect(await submittedStatusCount(study.id)).toBe(2)
        })

        it('re-submitting again within the SAME change-requested round does not append a third CODE-SUBMITTED', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
            const root = await createWorkspaceDir('reuse-resubmit-twice')
            workspaceRoots.push(root)

            await ensureRoundJobForLaunch(db, study.id)
            await submitCode(study.id, root, { 'main.R': 'round1' }, 'main.R')
            await flushDeferred()
            const round1Job = await db
                .selectFrom('studyJob')
                .select('id')
                .where('studyId', '=', study.id)
                .executeTakeFirstOrThrow()
            await db
                .insertInto('jobStatusChange')
                .values({ studyJobId: round1Job.id, status: 'CODE-CHANGES-REQUESTED' })
                .execute()

            // First resubmit of round 2 → appends the second CODE-SUBMITTED.
            await submitCode(study.id, root, { 'main.R': 'round2a' }, 'main.R')
            expect(await submittedStatusCount(study.id)).toBe(2)

            // Resubmit AGAIN before the reviewer decides round 2 → same round, idempotent, still 2.
            await submitCode(study.id, root, { 'main.R': 'round2b' }, 'main.R')
            expect(await jobCount(study.id)).toBe(1)
            expect(await submittedStatusCount(study.id)).toBe(2)
        })
    })

    describe('saveCodeResubmissionNoteDraftAction', () => {
        // Code resubmission keeps study.status APPROVED; eligibility is the latest submitted
        // job being in a resubmittable status (here CODE-CHANGES-REQUESTED), not study.status.
        it('persists the draft note while the study stays APPROVED for a same-lab user', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const { study } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                studyStatus: 'APPROVED',
                jobStatus: 'CODE-CHANGES-REQUESTED',
            })

            const result = actionResult(
                await saveCodeResubmissionNoteDraftAction({ studyId: study.id, note: 'A draft note' }),
            )
            expect(result.studyId).toBe(study.id)

            const row = await db
                .selectFrom('study')
                .select(['codeResubmissionNoteDraft'])
                .where('id', '=', study.id)
                .executeTakeFirstOrThrow()
            expect(row.codeResubmissionNoteDraft).toBe('A draft note')
        })

        it('rejects payloads larger than 10kb', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const { study } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                studyStatus: 'APPROVED',
                jobStatus: 'CODE-CHANGES-REQUESTED',
            })

            const tooLong = 'x'.repeat(10_001)
            const result = await saveCodeResubmissionNoteDraftAction({ studyId: study.id, note: tooLong })
            expect(result).toHaveProperty('error')
        })

        it('rejects a cross-lab save attempt instead of silently no-op (OTTER-607)', async () => {
            const { org: labA, user: ownerA } = await mockSessionWithTestData({
                orgSlug: 'lab-code-note-cross-A',
                orgType: 'lab',
            })
            const { study } = await insertTestStudyJobData({
                org: labA,
                researcherId: ownerA.id,
                studyStatus: 'APPROVED',
                jobStatus: 'CODE-CHANGES-REQUESTED',
            })

            // Switch session to a user in a different lab and try to save the draft.
            await mockSessionWithTestData({ orgSlug: 'lab-code-note-cross-B', orgType: 'lab' })
            const result = await saveCodeResubmissionNoteDraftAction({
                studyId: study.id,
                note: 'cross-lab attempt',
            })
            // Without the 0-row UPDATE check the client would render the autosave
            // indicator as "All changes saved" while nothing was persisted.
            expect('error' in result).toBe(true)

            const row = await db
                .selectFrom('study')
                .select('codeResubmissionNoteDraft')
                .where('id', '=', study.id)
                .executeTakeFirstOrThrow()
            expect(row.codeResubmissionNoteDraft).toBeNull()
        })

        it('rejects a save attempt when the latest job is not resubmittable', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const { study } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                studyStatus: 'APPROVED',
                jobStatus: 'JOB-READY',
            })

            const result = await saveCodeResubmissionNoteDraftAction({
                studyId: study.id,
                note: 'wrong-status attempt',
            })
            expect('error' in result).toBe(true)

            const row = await db
                .selectFrom('study')
                .select('codeResubmissionNoteDraft')
                .where('id', '=', study.id)
                .executeTakeFirstOrThrow()
            expect(row.codeResubmissionNoteDraft).toBeNull()
        })

        // OTTER-558: the QA repro, a Result-ready study whose FILES-APPROVED decision is buried under a
        // later CODE-SCANNED row. The old at(0) gate read the scan and threw on every keystroke.
        it('persists the draft when FILES-APPROVED exists but a later CODE-SCANNED sorts first', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const { study, job } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                studyStatus: 'APPROVED',
                jobStatus: 'CODE-SUBMITTED',
            })
            await insertStatus(job.id, 'CODE-APPROVED')
            await insertStatus(job.id, 'RUN-COMPLETE')
            await insertStatus(job.id, 'FILES-APPROVED')
            await insertStatus(job.id, 'CODE-SCANNED')

            const result = actionResult(
                await saveCodeResubmissionNoteDraftAction({ studyId: study.id, note: 'A draft note' }),
            )
            expect(result.studyId).toBe(study.id)

            const row = await db
                .selectFrom('study')
                .select('codeResubmissionNoteDraft')
                .where('id', '=', study.id)
                .executeTakeFirstOrThrow()
            expect(row.codeResubmissionNoteDraft).toBe('A draft note')
        })

        it('persists the draft for a results-rejected study (FILES-REJECTED)', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const { study, job } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                studyStatus: 'APPROVED',
                jobStatus: 'CODE-SUBMITTED',
            })
            await insertStatus(job.id, 'CODE-APPROVED')
            await insertStatus(job.id, 'RUN-COMPLETE')
            await insertStatus(job.id, 'FILES-REJECTED')

            const result = actionResult(
                await saveCodeResubmissionNoteDraftAction({ studyId: study.id, note: 'reworking after rejection' }),
            )
            expect(result.studyId).toBe(study.id)

            const row = await db
                .selectFrom('study')
                .select('codeResubmissionNoteDraft')
                .where('id', '=', study.id)
                .executeTakeFirstOrThrow()
            expect(row.codeResubmissionNoteDraft).toBe('reworking after rejection')
        })

        it('rejects when a CODE-CHANGES-REQUESTED is stale (a fresh CODE-SUBMITTED was appended)', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const { study, job } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                studyStatus: 'APPROVED',
                jobStatus: 'CODE-SUBMITTED',
            })
            await insertStatus(job.id, 'CODE-CHANGES-REQUESTED')
            // Already resubmitted once, awaiting a new decision, so not resubmittable again.
            await insertStatus(job.id, 'CODE-SUBMITTED')

            const result = await saveCodeResubmissionNoteDraftAction({ studyId: study.id, note: 'stale attempt' })
            expect('error' in result).toBe(true)

            const row = await db
                .selectFrom('study')
                .select('codeResubmissionNoteDraft')
                .where('id', '=', study.id)
                .executeTakeFirstOrThrow()
            expect(row.codeResubmissionNoteDraft).toBeNull()
        })
    })

    describe('resubmitStudyCodeAction', () => {
        const wordsString = (count: number) => Array.from({ length: count }, (_, i) => `word${i}`).join(' ')

        it('creates a new job, records the resubmission note, clears the draft, and leaves the study APPROVED', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const { study } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                studyStatus: 'APPROVED',
                jobStatus: 'CODE-CHANGES-REQUESTED',
            })
            await db
                .updateTable('study')
                .set({ codeResubmissionNoteDraft: 'work in progress' })
                .where('id', '=', study.id)
                .execute()

            const root = await createWorkspaceDir('resubmit-ide')
            workspaceRoots.push(root)
            await writeWorkspaceFiles(root, study.id, {
                'main.R': 'print("main")',
                'helper.R': 'print("helper")',
            })

            const result = actionResult(
                await resubmitStudyCodeAction({
                    studyId: study.id,
                    mainFileName: 'main.R',
                    fileNames: ['main.R', 'helper.R'],
                    resubmissionNote: wordsString(10),
                }),
            )
            expect(result.studyJobId).toBeDefined()

            const updatedStudy = await db
                .selectFrom('study')
                .select(['status', 'submittedAt', 'codeResubmissionNoteDraft'])
                .where('id', '=', study.id)
                .executeTakeFirstOrThrow()
            expect(updatedStudy.status).toBe('APPROVED')
            expect(updatedStudy.submittedAt).toEqual(study.submittedAt)
            expect(updatedStudy.codeResubmissionNoteDraft).toBeNull()

            const newJob = await db
                .selectFrom('studyJob')
                .select(['resubmissionNote'])
                .where('id', '=', result.studyJobId)
                .executeTakeFirstOrThrow()
            expect(newJob.resubmissionNote).not.toBeNull()
        })

        it('clears the stale AI review so a fresh one is generated for the resubmitted code (SHRMP-263)', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const { study, job } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                studyStatus: 'APPROVED',
                jobStatus: 'CODE-CHANGES-REQUESTED',
            })
            const staleExplanation = 'Summary of the previously submitted code'
            await db
                .insertInto('studyReview')
                .values({
                    studyJobId: job.id,
                    report: {
                        proposalSummary: 'old proposal summary',
                        codeExplanation: staleExplanation,
                        alignmentCheck: { isAligned: true, findings: [] },
                        complianceCheck: { isCompliant: true, findings: [] },
                    },
                })
                .execute()

            const root = await createWorkspaceDir('resubmit-regen-review')
            workspaceRoots.push(root)
            await writeWorkspaceFiles(root, study.id, { 'main.R': 'print("new code")' })

            const result = actionResult(
                await resubmitStudyCodeAction({
                    studyId: study.id,
                    mainFileName: 'main.R',
                    fileNames: ['main.R'],
                    resubmissionNote: wordsString(10),
                }),
            )
            // A change-requested round is revised in place: same job, new files.
            expect(result.studyJobId).toBe(job.id)

            await flushDeferred()

            const review = await getStudyReviewForJob(result.studyJobId)
            expect(review?.report?.codeExplanation).not.toBe(staleExplanation)
        })

        it('rejects an empty note', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const { study } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                studyStatus: 'APPROVED',
                jobStatus: 'CODE-CHANGES-REQUESTED',
            })

            const root = await createWorkspaceDir('resubmit-empty-note')
            workspaceRoots.push(root)
            await writeWorkspaceFiles(root, study.id, { 'main.R': 'print("main")' })

            const result = await resubmitStudyCodeAction({
                studyId: study.id,
                mainFileName: 'main.R',
                fileNames: ['main.R'],
                resubmissionNote: '',
            })
            expect(result).toHaveProperty('error')
        })

        it('rejects a note one character over the cap and accepts one at exactly the cap', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const { study } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                studyStatus: 'APPROVED',
                jobStatus: 'CODE-CHANGES-REQUESTED',
            })

            const root = await createWorkspaceDir('resubmit-note-cap')
            workspaceRoots.push(root)
            await writeWorkspaceFiles(root, study.id, { 'main.R': 'print("main")' })

            const over = await resubmitStudyCodeAction({
                studyId: study.id,
                mainFileName: 'main.R',
                fileNames: ['main.R'],
                resubmissionNote: 'x'.repeat(RESUBMIT_NOTE_MAX_CHARACTERS + 1),
            })
            expect(over).toHaveProperty('error')

            // Whitespace at the ends is excluded, so this is exactly at the cap, not one over.
            actionResult(
                await resubmitStudyCodeAction({
                    studyId: study.id,
                    mainFileName: 'main.R',
                    fileNames: ['main.R'],
                    resubmissionNote: `  ${'x'.repeat(RESUBMIT_NOTE_MAX_CHARACTERS)}  `,
                }),
            )
        })

        it('rejects when latest job status is not in the allowed set', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const { study } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                studyStatus: 'APPROVED',
                jobStatus: 'CODE-SUBMITTED',
            })

            const root = await createWorkspaceDir('resubmit-wrong-status')
            workspaceRoots.push(root)
            await writeWorkspaceFiles(root, study.id, { 'main.R': 'print("main")' })

            const result = await resubmitStudyCodeAction({
                studyId: study.id,
                mainFileName: 'main.R',
                fileNames: ['main.R'],
                resubmissionNote: wordsString(10),
            })
            expect(result).toHaveProperty('error')
        })

        // OTTER-558: the final submit must not read statusChanges.at(0) either; a resubmittable
        // decision buried under a later CODE-SCANNED must still resubmit.
        it('resubmits when CODE-CHANGES-REQUESTED exists but a later CODE-SCANNED sorts first', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const { study, job } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                studyStatus: 'APPROVED',
                jobStatus: 'CODE-SUBMITTED',
            })
            await insertStatus(job.id, 'CODE-CHANGES-REQUESTED')
            await insertStatus(job.id, 'CODE-SCANNED')

            const root = await createWorkspaceDir('resubmit-late-scan')
            workspaceRoots.push(root)
            await writeWorkspaceFiles(root, study.id, { 'main.R': 'print("main")' })

            const result = actionResult(
                await resubmitStudyCodeAction({
                    studyId: study.id,
                    mainFileName: 'main.R',
                    fileNames: ['main.R'],
                    resubmissionNote: wordsString(10),
                }),
            )
            expect(result.studyJobId).toBeDefined()
        })

        // Results-ready (FILES-APPROVED) resubmit with a later CODE-SCANNED sorting first — the QA
        // scenario, at the final-submit gate (mirrors the save-draft coverage).
        it('resubmits a results-ready study when FILES-APPROVED is buried under a later CODE-SCANNED', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const { study, job } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                studyStatus: 'APPROVED',
                jobStatus: 'CODE-SUBMITTED',
            })
            await insertStatus(job.id, 'CODE-APPROVED')
            await insertStatus(job.id, 'RUN-COMPLETE')
            await insertStatus(job.id, 'FILES-APPROVED')
            await insertStatus(job.id, 'CODE-SCANNED')

            const root = await createWorkspaceDir('resubmit-results-ready')
            workspaceRoots.push(root)
            await writeWorkspaceFiles(root, study.id, { 'main.R': 'print("main")' })

            const result = actionResult(
                await resubmitStudyCodeAction({
                    studyId: study.id,
                    mainFileName: 'main.R',
                    fileNames: ['main.R'],
                    resubmissionNote: wordsString(10),
                }),
            )
            expect(result.studyJobId).toBeDefined()
        })

        it('rejects the final submit when a CODE-CHANGES-REQUESTED is stale (fresh CODE-SUBMITTED appended)', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const { study, job } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                studyStatus: 'APPROVED',
                jobStatus: 'CODE-SUBMITTED',
            })
            await insertStatus(job.id, 'CODE-CHANGES-REQUESTED')
            // Already resubmitted — awaiting a new decision, so the gate rejects before file checks.
            await insertStatus(job.id, 'CODE-SUBMITTED')

            const result = await resubmitStudyCodeAction({
                studyId: study.id,
                mainFileName: 'main.R',
                fileNames: ['main.R'],
                resubmissionNote: wordsString(10),
            })
            expect(result).toHaveProperty('error')
        })
    })

    // Proposal approval is the last study.status transition; every code round after it
    // (submit → decision → resubmit) lives on the job and must leave the study untouched.
    describe('proposal status across code rounds', () => {
        it('stays APPROVED with a stable submittedAt through submit, clarification, and resubmit', async () => {
            const enclave = await insertTestOrg({ type: 'enclave', slug: 'test-status-roundtrip' })
            const lab = await insertTestOrg({ slug: `${enclave.slug}-lab`, type: 'lab' })

            await mockSessionWithTestData({ orgSlug: lab.slug, orgType: 'lab' })
            const draft = actionResult(
                await onSaveDraftStudyAction({
                    orgSlug: enclave.slug,
                    studyInfo: { title: 'Status round trip', piName: 'PI', language: 'R' as const },
                    submittingOrgSlug: lab.slug,
                }),
            )
            actionResult(await finalizeStudySubmissionAction({ studyId: draft.studyId }))

            const studyRow = () =>
                db
                    .selectFrom('study')
                    .select(['status', 'approvedAt', 'submittedAt'])
                    .where('id', '=', draft.studyId)
                    .executeTakeFirstOrThrow()

            await mockSessionWithTestData({ orgSlug: enclave.slug, orgType: 'enclave' })
            actionResult(await approveStudyProposalAction({ studyId: draft.studyId, orgSlug: enclave.slug }))

            const approved = await studyRow()
            expect(approved.status).toBe('APPROVED')
            expect(approved.approvedAt).not.toBeNull()

            const { user: researcher } = await mockSessionWithTestData({ orgSlug: lab.slug, orgType: 'lab' })
            const root = await createWorkspaceDir('roundtrip-ide')
            workspaceRoots.push(root)
            await writeWorkspaceFiles(root, draft.studyId, { 'main.R': 'print("main")' })
            actionResult(
                await submitStudyCodeAction({
                    studyId: draft.studyId,
                    mainFileName: 'main.R',
                    fileNames: ['main.R'],
                }),
            )

            const afterSubmit = await studyRow()
            expect(afterSubmit.status).toBe('APPROVED')
            expect(afterSubmit.submittedAt).toEqual(approved.submittedAt)

            await flushDeferred()
            const auditEntries = await getAuditEntries(draft.studyId, 'STUDY')
            expect(auditEntries).toContainEqual({
                eventType: 'UPDATED',
                recordType: 'STUDY',
                recordId: draft.studyId,
                userId: researcher.id,
            })

            await mockSessionWithTestData({ orgSlug: enclave.slug, orgType: 'enclave' })
            actionResult(
                await submitCodeReviewDecisionAction({
                    studyId: draft.studyId,
                    orgSlug: enclave.slug,
                    decision: 'needs-clarification',
                    feedback: buildFeedback(60),
                    criteria: {
                        proposalAlignment: 'yes',
                        agreementCompliance: 'yes',
                        securityChecks: 'yes',
                        privacyProtection: 'yes',
                    },
                }),
            )

            const afterDecision = await studyRow()
            expect(afterDecision.status).toBe('APPROVED')

            await mockSessionWithTestData({ orgSlug: lab.slug, orgType: 'lab' })
            await writeWorkspaceFiles(root, draft.studyId, { 'main.R': 'print("revised")' })
            actionResult(
                await resubmitStudyCodeAction({
                    studyId: draft.studyId,
                    mainFileName: 'main.R',
                    fileNames: ['main.R'],
                    resubmissionNote: buildFeedback(10),
                }),
            )

            const afterResubmit = await studyRow()
            expect(afterResubmit.status).toBe('APPROVED')
            expect(afterResubmit.submittedAt).toEqual(approved.submittedAt)
        })
    })
})
