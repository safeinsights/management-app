import * as aws from '@/server/aws'
import {
    actionResult,
    cleanupWorkspaceDirs,
    createWorkspaceDir,
    db,
    expectStudyJobRecords,
    getAuditEntries,
    insertTestOrg,
    insertTestStudyData,
    insertTestStudyJobData,
    insertTestStudyOnly,
    mockSessionWithTestData,
    writeWorkspaceFiles,
} from '@/tests/unit.helpers'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    addJobToStudyAction,
    onDeleteStudyAction,
    onSaveDraftStudyAction,
    onSubmitDraftStudyAction,
    onUpdateDraftStudyAction,
    finalizeStudySubmissionAction,
    submitStudyCodeAction,
} from '@/server/actions/study-request'
import { purgeProposalYjsDocsBeforeAt } from '@/server/db/yjs-cleanup'
import { lexicalJson } from '@/lib/word-count'
import { DEFAULT_DRAFT_TITLE } from '@/app/[orgSlug]/study/[studyId]/proposal/schema'

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

            // Verify draft created with default title
            let study = await db
                .selectFrom('study')
                .selectAll('study')
                .where('id', '=', draftResult.studyId)
                .executeTakeFirst()
            expect(study?.status).toEqual('DRAFT')
            expect(study?.language).toEqual('PYTHON')
            expect(study?.title).toEqual(DEFAULT_DRAFT_TITLE)

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
            const enclave = await insertTestOrg({ type: 'enclave', slug: 'test-otter-497-meta' })
            const lab = await insertTestOrg({ slug: `${enclave.slug}-lab`, type: 'lab' })
            await mockSessionWithTestData({ orgSlug: lab.slug, orgType: 'lab' })

            const draftResult = actionResult(
                await onSaveDraftStudyAction({
                    orgSlug: enclave.slug,
                    studyInfo: { title: 'Meta', piName: 'PI', language: 'R' as const },
                    submittingOrgSlug: lab.slug,
                }),
            )

            const result = actionResult(await finalizeStudySubmissionAction({ studyId: draftResult.studyId }))

            expect(typeof result.submitterFullName).toBe('string')
            expect(result.submitterFullName.length).toBeGreaterThan(0)
            expect(result.orgName).toBe(enclave.name)
        })

        it('finalizeStudySubmissionAction is first-submit-wins: second concurrent caller fails', async () => {
            const enclave = await insertTestOrg({ type: 'enclave', slug: 'test-otter-497-race' })
            const lab = await insertTestOrg({ slug: `${enclave.slug}-lab`, type: 'lab' })
            await mockSessionWithTestData({ orgSlug: lab.slug, orgType: 'lab' })

            const draftResult = actionResult(
                await onSaveDraftStudyAction({
                    orgSlug: enclave.slug,
                    studyInfo: { title: 'Race', piName: 'PI', language: 'R' as const },
                    submittingOrgSlug: lab.slug,
                }),
            )

            const [first, second] = await Promise.all([
                finalizeStudySubmissionAction({ studyId: draftResult.studyId }),
                finalizeStudySubmissionAction({ studyId: draftResult.studyId }),
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
                .where('id', '=', draftResult.studyId)
                .executeTakeFirstOrThrow()
            expect(study.status).toBe('PENDING-REVIEW')
        })

        it('finalizeStudySubmissionAction transitions CHANGE-REQUESTED → PENDING-REVIEW', async () => {
            const { org } = await mockSessionWithTestData({ orgType: 'lab' })
            const { study } = await insertTestStudyOnly({ org })

            // Force the test study into CHANGE-REQUESTED status (insertTestStudyOnly defaults to APPROVED)
            await db.updateTable('study').set({ status: 'CHANGE-REQUESTED' }).where('id', '=', study.id).execute()

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
            await db.updateTable('study').set({ status: 'DRAFT' }).where('id', '=', study.id).execute()

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
                        name: `review-feedback-${study.id}`,
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
            expect(remainingNames).toEqual([`review-feedback-${study.id}`])
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
            const enclave = await insertTestOrg({ type: 'enclave', slug: 'test-otter-497-coauthor' })
            const lab = await insertTestOrg({ slug: `${enclave.slug}-lab`, type: 'lab' })

            // First user creates the draft.
            await mockSessionWithTestData({ orgSlug: lab.slug, orgType: 'lab' })
            const draftResult = actionResult(
                await onSaveDraftStudyAction({
                    orgSlug: enclave.slug,
                    studyInfo: { title: 'Original', piName: 'PI', language: 'R' as const },
                    submittingOrgSlug: lab.slug,
                }),
            )

            await db
                .updateTable('study')
                .set({ status: 'CHANGE-REQUESTED' })
                .where('id', '=', draftResult.studyId)
                .execute()

            // Second user in the same lab updates the draft. mockSessionWithTestData
            // creates a fresh user; the lab-membership middleware should allow the edit.
            await mockSessionWithTestData({ orgSlug: lab.slug, orgType: 'lab' })

            actionResult(
                await onUpdateDraftStudyAction({
                    studyId: draftResult.studyId,
                    studyInfo: { title: 'Coauthored', piName: 'PI', language: 'R' as const },
                }),
            )

            const updated = await db
                .selectFrom('study')
                .select(['title', 'status'])
                .where('id', '=', draftResult.studyId)
                .executeTakeFirstOrThrow()
            expect(updated.title).toBe('Coauthored')
            expect(updated.status).toBe('CHANGE-REQUESTED')
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
})
