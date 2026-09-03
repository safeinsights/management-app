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
import { STUDY_TITLE_BLANK_ERROR, STUDY_TITLE_OVER_LIMIT_ERROR } from '@/app/[orgSlug]/study/request/form-schemas'
import { purgeProposalYjsDocsBeforeAt } from '@/server/db/yjs-cleanup'
import { getStudyReviewForJob, latestJobForStudy } from '@/server/db/queries'
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
        const enclave = await insertTestOrg({ type: 'enclave', slug: 'test-draft' })

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
        const enclave = await insertTestOrg({ type: 'enclave', slug: 'test-submit' })

        const lab = await insertTestOrg({ slug: `${enclave.slug}-lab`, type: 'lab' })
        await mockSessionWithTestData({ orgSlug: lab.slug, orgType: 'lab' })

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

        let study = await db
            .selectFrom('study')
            .selectAll('study')
            .where('id', '=', draftResult.studyId)
            .executeTakeFirst()
        expect(study?.status).toEqual('DRAFT')

        const submitResult = actionResult(
            await onSubmitDraftStudyAction({
                studyId: draftResult.studyId,
                mainCodeFileName: 'main.R',
                codeFileNames: ['helpers.R'],
            }),
        )

        expect(submitResult.studyId).toEqual(draftResult.studyId)
        expect(submitResult.studyJobId).toBeDefined()

        study = await db.selectFrom('study').selectAll('study').where('id', '=', draftResult.studyId).executeTakeFirst()
        expect(study?.status).toEqual('DRAFT')

        actionResult(await finalizeStudySubmissionAction({ studyId: draftResult.studyId }))

        study = await db.selectFrom('study').selectAll('study').where('id', '=', draftResult.studyId).executeTakeFirst()
        expect(study?.status).toEqual('PENDING-REVIEW')
    })

    it('submission flow works with Python language', async () => {
        const enclave = await insertTestOrg({ type: 'enclave', slug: 'test-python' })
        const lab = await insertTestOrg({ slug: `${enclave.slug}-lab`, type: 'lab' })
        await mockSessionWithTestData({ orgSlug: lab.slug, orgType: 'lab' })

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

        const submitResult = actionResult(
            await onSubmitDraftStudyAction({
                studyId: draftResult.studyId,
                mainCodeFileName: 'main.py',
                codeFileNames: ['helpers.py'],
            }),
        )

        expect(submitResult.studyId).toBeDefined()
        expect(submitResult.studyJobId).toBeDefined()

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
        const { studyId } = await insertTestStudyData({ org })

        const result = await onSubmitDraftStudyAction({
            studyId,
            mainCodeFileName: 'main.R',
            codeFileNames: [],
        })

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

        await mockSessionWithTestData({ orgSlug: 'lab-delete-cross-B', orgType: 'lab' })
        const result = await onDeleteStudyAction({ studyId })
        expect(result).toHaveProperty('error')

        const study = await db.selectFrom('study').select('id').where('id', '=', studyId).executeTakeFirst()
        expect(study?.id).toBe(studyId)
    })

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

            actionResult(await finalizeStudySubmissionAction({ studyId: draftResult.studyId }))

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

            await mockSessionWithTestData({ orgSlug: labA.slug, orgType: 'lab' })
            const draftResult = actionResult(
                await onSaveDraftStudyAction({
                    orgSlug: enclave.slug,
                    studyInfo: { title: 'Cross-lab', piName: 'PI', language: 'R' as const },
                    submittingOrgSlug: labA.slug,
                }),
            )

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
            expect(remainingNames).toEqual([`review-feedback-${study.id}-v1`])
        })

        it('purgeProposalYjsDocsBeforeAt deletes only rows whose updatedAt predates the bound', async () => {
            const { org } = await mockSessionWithTestData({ orgType: 'lab' })
            const { study } = await insertTestStudyOnly({ org })

            const before = new Date('2026-01-01T00:00:00Z')
            const after = new Date('2026-01-01T00:00:10Z')

            await db
                .insertInto('yjsDocument')
                .values({
                    name: `proposal-${study.id}-fields`,
                    studyId: study.id,
                    data: Buffer.from([0]),
                    updatedAt: before,
                })
                .execute()

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

        it('finalizeStudySubmissionAction rejects an over-limit stored title when none is submitted', async () => {
            const { lab, studyId } = await createTestProposalDraft({ enclaveSlug: 'title-cap-finalize-omit' })
            await mockSessionWithTestData({ orgSlug: lab.slug, orgType: 'lab' })
            await db.updateTable('study').set({ title: OVER_LIMIT }).where('id', '=', studyId).execute()

            const result = await finalizeStudySubmissionAction({ studyId })

            expect(result).toEqual({ error: { title: STUDY_TITLE_OVER_LIMIT_ERROR } })
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

            await ensureRoundJobForLaunch(db, study.id)
            expect(await jobCount(study.id)).toBe(1)
            const launchJob = await db
                .selectFrom('studyJob')
                .select('id')
                .where('studyId', '=', study.id)
                .executeTakeFirstOrThrow()

            await submitCode(study.id, root, { 'main.R': 'print(1)', 'helper.R': 'print(2)' }, 'main.R')

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

            await submitCode(study.id, root, { 'main.R': 'v2', 'extra.R': 'v2' }, 'main.R')

            expect(await jobCount(study.id)).toBe(1)
            expect(await codeFilesFor(study.id)).toEqual([
                { name: 'extra.R', fileType: 'SUPPLEMENTAL-CODE' },
                { name: 'main.R', fileType: 'MAIN-CODE' },
            ])
            expect(aws.deleteFolderContents).toHaveBeenCalledTimes(1)
            expect(await submittedStatusCount(study.id)).toBe(1)
        })

        it('resubmitting after change-requested REUSES the round job (same job, second submission)', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
            const root = await createWorkspaceDir('reuse-resubmit')
            workspaceRoots.push(root)

            await ensureRoundJobForLaunch(db, study.id)
            await submitCode(study.id, root, { 'main.R': 'round1' }, 'main.R')
            // Drain the deferred CODE-SCANNED insert first, or it races in and becomes the latest status.
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

            expect(await jobCount(study.id)).toBe(1)
            expect(await submittedStatusCount(study.id)).toBe(2)

            const jobAfter = await db
                .selectFrom('studyJob')
                .select(['resubmissionNote', 'resubmissionRound'])
                .where('id', '=', round1Job.id)
                .executeTakeFirstOrThrow()
            expect(jobAfter.resubmissionNote).not.toBeNull()
            expect(jobAfter.resubmissionRound).toBe(2)
        })

        it('resubmit succeeds after a file upload reuses the round job (no new job on CR upload)', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
            const root = await createWorkspaceDir('reuse-resubmit-upload')
            workspaceRoots.push(root)

            await ensureRoundJobForLaunch(db, study.id)
            await submitCode(study.id, root, { 'main.R': 'round1' }, 'main.R')
            // Drain the deferred CODE-SCANNED insert first, or it races in and becomes the latest status.
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

            await submitCode(study.id, root, { 'main.R': 'round2a' }, 'main.R')
            expect(await submittedStatusCount(study.id)).toBe(2)

            await submitCode(study.id, root, { 'main.R': 'round2b' }, 'main.R')
            expect(await jobCount(study.id)).toBe(1)
            expect(await submittedStatusCount(study.id)).toBe(2)
        })
    })

    describe('saveCodeResubmissionNoteDraftAction', () => {
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

            await mockSessionWithTestData({ orgSlug: 'lab-code-note-cross-B', orgType: 'lab' })
            const result = await saveCodeResubmissionNoteDraftAction({
                studyId: study.id,
                note: 'cross-lab attempt',
            })
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
            expect(result.studyJobId).toBe(job.id)

            await flushDeferred()

            const review = await getStudyReviewForJob(await latestJobForStudy(study.id))
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
