import { db } from '@/database'
import * as aws from '@/server/aws'
import { actionResult, insertTestOrg, insertTestStudyData, mockSessionWithTestData } from '@/tests/unit.helpers'
import { describe, expect, it, vi } from 'vitest'
import {
    onDeleteStudyAction,
    onSaveDraftStudyAction,
    onSubmitDraftStudyAction,
    onUpdateDraftStudyAction,
    finalizeStudySubmissionAction,
} from '@/server/actions/study-request'
import { lexicalJson } from '@/lib/word-count'

vi.mock('@/server/aws', async () => {
    const actual = await vi.importActual('@/server/aws')
    return {
        ...actual,
        signedUrlForStudyUpload: vi.fn().mockResolvedValue('test-signed-url'),
        deleteFolderContents: vi.fn(),
    }
})

describe('Request Study Actions', () => {
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
            expect(study?.title).toEqual('Untitled Draft')

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
})
