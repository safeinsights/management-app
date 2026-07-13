import * as aws from '@/server/aws'
import {
    actionResult,
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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    addJobToStudyAction,
    getDraftStudyAction,
    onDeleteStudyAction,
    onSaveDraftStudyAction,
    onSubmitDraftStudyAction,
    onUpdateDraftStudyAction,
    finalizeStudySubmissionAction,
    resubmitStudyCodeAction,
    saveCodeResubmissionNoteDraftAction,
    submitStudyCodeAction,
} from '@/server/actions/study-request'
import { purgeProposalYjsDocsBeforeAt } from '@/server/db/yjs-cleanup'
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

    // APPROVED → PENDING-REVIEW is a code re-submission, sends "code submitted for review" email
    it('finalizeStudySubmissionAction calls onStudyCodeSubmitted for APPROVED studies', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, studyStatus: 'APPROVED' })

        actionResult(await finalizeStudySubmissionAction({ studyId: study.id }))

        const auditEntries = await getAuditEntries(study.id, 'STUDY')

        expect(auditEntries).toContainEqual({
            eventType: 'UPDATED',
            recordType: 'STUDY',
            recordId: study.id,
            userId: user.id,
        })
        expect(auditEntries).not.toContainEqual(
            expect.objectContaining({
                eventType: 'CREATED',
                recordId: study.id,
            }),
        )
    })

    // addJobToStudyAction is only used for re-submissions (study already exists and is APPROVED),
    // so it always sends "code submitted for review" email
    it('addJobToStudyAction calls onStudyCodeSubmitted', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, studyStatus: 'APPROVED' })

        actionResult(
            await addJobToStudyAction({
                studyId: study.id,
                mainCodeFileName: 'main.R',
                codeFileNames: [],
            }),
        )

        const auditEntries = await getAuditEntries(study.id, 'STUDY')

        expect(auditEntries).toContainEqual({
            eventType: 'UPDATED',
            recordType: 'STUDY',
            recordId: study.id,
            userId: user.id,
        })
    })

    describe('OpenStax Proposal Flow (Step 2)', () => {
        it('creates draft with step 1 fields, updates with proposal fields, and submits', async () => {
            const enclave = await insertTestOrg({ type: 'enclave', slug: 'test-openstax-flow' })
            const lab = await insertTestOrg({ slug: `${enclave.slug}-lab`, type: 'lab' })
            await mockSessionWithTestData({ orgSlug: lab.slug, orgType: 'lab' })

            // Step 1: Create draft with org and language only (OpenStax step 1)
            const draftResult = actionResult(
                await onSaveDraftStudyAction({
                    orgSlug: enclave.slug,
                    studyInfo: {
                        language: 'PYTHON' as const,
                    },
                    submittingOrgSlug: lab.slug,
                }),
            )

            expect(draftResult.studyId).toBeDefined()

            // Drafts persist a NULL title until the researcher fills one in.
            let study = await db
                .selectFrom('study')
                .selectAll('study')
                .where('id', '=', draftResult.studyId)
                .executeTakeFirst()
            expect(study?.status).toEqual('DRAFT')
            expect(study?.language).toEqual('PYTHON')
            expect(study?.title).toBeNull()

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
        it('creates job files, uploads workspace files, and moves the study to PENDING-REVIEW', async () => {
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
                .select(['status'])
                .where('id', '=', study.id)
                .executeTakeFirstOrThrow()
            expect(updatedStudy.status).toBe('PENDING-REVIEW')

            await expectStudyJobRecords(study.id, [
                { name: 'main.R', fileType: 'MAIN-CODE' },
                { name: 'helper.R', fileType: 'SUPPLEMENTAL-CODE' },
            ])

            expect(aws.storeS3File).toHaveBeenCalledTimes(2)
        })

        // Two entries that resolve to the same storage path (here a duplicated supplemental name)
        // must not trip the study_job_file(study_job_id, path) unique index added for OTTER-642: they
        // collapse to a single SUPPLEMENTAL-CODE row with the MAIN-CODE row preserved, rather than the
        // submit throwing a constraint violation.
        it('collapses code files that resolve to the same storage path instead of failing', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
            const root = await createWorkspaceDir('submit-ide-dupe')
            workspaceRoots.push(root)
            await writeWorkspaceFiles(root, study.id, {
                'main.R': 'print("main")',
                'helper.R': 'print("helper")',
            })

            const result = actionResult(
                await submitStudyCodeAction({
                    studyId: study.id,
                    mainFileName: 'main.R',
                    fileNames: ['main.R', 'helper.R', 'helper.R'],
                }),
            )
            expect(result.studyJobId).toBeDefined()

            const jobFiles = await db
                .selectFrom('studyJobFile')
                .select(['name', 'fileType'])
                .where('studyJobId', '=', result.studyJobId)
                .orderBy('fileType', 'asc')
                .execute()
            expect(jobFiles).toEqual([
                { name: 'main.R', fileType: 'MAIN-CODE' },
                { name: 'helper.R', fileType: 'SUPPLEMENTAL-CODE' },
            ])
        })

        it('serializes concurrent submissions with different file sets', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
            const root = await createWorkspaceDir('submit-ide-concurrent')
            workspaceRoots.push(root)
            await writeWorkspaceFiles(root, study.id, {
                'main-a.R': 'print("main a")',
                'only-a.R': 'print("only a")',
                'main-b.R': 'print("main b")',
                'only-b.R': 'print("only b")',
            })
            const existingJob = await ensureRoundJobForLaunch(db, study.id)

            const submissions = await Promise.all([
                submitStudyCodeAction({
                    studyId: study.id,
                    mainFileName: 'main-a.R',
                    fileNames: ['main-a.R', 'only-a.R'],
                }),
                submitStudyCodeAction({
                    studyId: study.id,
                    mainFileName: 'main-b.R',
                    fileNames: ['main-b.R', 'only-b.R'],
                }),
            ])
            const results = submissions.map(actionResult)
            expect(results.map((result) => result.studyJobId)).toEqual([existingJob.id, existingJob.id])

            const files = await db
                .selectFrom('studyJobFile')
                .select('name')
                .where('studyJobId', '=', existingJob.id)
                .orderBy('name')
                .execute()
            expect([
                ['main-a.R', 'only-a.R'],
                ['main-b.R', 'only-b.R'],
            ]).toContainEqual(files.map((file) => file.name))
        })

        it('creates one round job when first submissions race', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
            const root = await createWorkspaceDir('submit-ide-first-concurrent')
            workspaceRoots.push(root)
            await writeWorkspaceFiles(root, study.id, {
                'main-a.R': 'print("main a")',
                'main-b.R': 'print("main b")',
            })

            const submissions = await Promise.all([
                submitStudyCodeAction({ studyId: study.id, mainFileName: 'main-a.R', fileNames: ['main-a.R'] }),
                submitStudyCodeAction({ studyId: study.id, mainFileName: 'main-b.R', fileNames: ['main-b.R'] }),
            ])
            const jobIds = submissions.map((submission) => actionResult(submission).studyJobId)
            expect(new Set(jobIds).size).toBe(1)

            const jobs = await db.selectFrom('studyJob').select('id').where('studyId', '=', study.id).execute()
            expect(jobs).toHaveLength(1)
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
    })

    describe('resubmitStudyCodeAction', () => {
        const wordsString = (count: number) => Array.from({ length: count }, (_, i) => `word${i}`).join(' ')

        it('creates a new job, records the resubmission note, clears the draft, and flips the study to PENDING-REVIEW', async () => {
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
                .select(['status', 'codeResubmissionNoteDraft'])
                .where('id', '=', study.id)
                .executeTakeFirstOrThrow()
            expect(updatedStudy.status).toBe('PENDING-REVIEW')
            expect(updatedStudy.codeResubmissionNoteDraft).toBeNull()

            const newJob = await db
                .selectFrom('studyJob')
                .select(['resubmissionNote'])
                .where('id', '=', result.studyJobId)
                .executeTakeFirstOrThrow()
            expect(newJob.resubmissionNote).not.toBeNull()
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
    })
})
