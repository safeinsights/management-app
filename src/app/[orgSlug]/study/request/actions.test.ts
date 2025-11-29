import { db } from '@/database'
import * as aws from '@/server/aws'
import { actionResult, insertTestOrg, insertTestStudyData, mockSessionWithTestData } from '@/tests/unit.helpers'
import { describe, expect, it, vi } from 'vitest'
import { onCreateStudyAction, onDeleteStudyAction } from './actions'

vi.mock('@/server/aws', async () => {
    const actual = await vi.importActual('@/server/aws')
    return {
        ...actual,
        signedUrlForStudyUpload: vi.fn().mockResolvedValue('test-signed-url'),
        deleteFolderContents: vi.fn(),
    }
})

describe('Request Study Actions', () => {
    it('onCreateStudyAction creates a study', async () => {
        // create the enclave that owns the data
        const enclave = await insertTestOrg({ type: 'enclave', slug: 'test' })

        // create its lab counterpart
        const lab = await insertTestOrg({ slug: `${enclave.slug}-lab`, type: 'lab' })
        await mockSessionWithTestData({ orgSlug: lab.slug, orgType: 'lab' })

        const studyInfo = {
            title: 'Test Study',
            piName: 'Test PI',
            language: 'R' as const,
            descriptionDocPath: 'test-desc.pdf',
            irbDocPath: 'test-irb.pdf',
            agreementDocPath: 'test-agreement.pdf',
            mainCodeFilePath: 'main.R',
            additionalCodeFilePaths: ['helpers.R'],
        }

        const result = actionResult(
            await onCreateStudyAction({
                orgSlug: enclave.slug,
                studyInfo,
                mainCodeFileName: 'main.R',
                codeFileNames: ['helpers.R'],
                submittingOrgSlug: lab.slug,
            }),
        )

        expect(result.studyId).toBeDefined()
        expect(result.studyJobId).toBeDefined()

        const study = await db
            .selectFrom('study')
            .selectAll('study')
            .where('id', '=', result.studyId)
            .executeTakeFirst()
        expect(study).toBeDefined()
        expect(study?.title).toEqual(studyInfo.title)
        expect(study?.language).toEqual('R')
    })

    it('onCreateStudyAction stores Python language correctly', async () => {
        const enclave = await insertTestOrg({ type: 'enclave', slug: 'test-python' })
        const lab = await insertTestOrg({ slug: `${enclave.slug}-lab`, type: 'lab' })
        await mockSessionWithTestData({ orgSlug: lab.slug, orgType: 'lab' })

        const studyInfo = {
            title: 'Python Study',
            piName: 'Test PI',
            language: 'PYTHON' as const,
            descriptionDocPath: 'test-desc.pdf',
            irbDocPath: 'test-irb.pdf',
            agreementDocPath: 'test-agreement.pdf',
            mainCodeFilePath: 'main.py',
            additionalCodeFilePaths: ['helpers.py'],
        }

        const result = actionResult(
            await onCreateStudyAction({
                orgSlug: enclave.slug,
                studyInfo,
                mainCodeFileName: 'main.py',
                codeFileNames: ['helpers.py'],
                submittingOrgSlug: lab.slug,
            }),
        )

        expect(result.studyId).toBeDefined()
        expect(result.studyJobId).toBeDefined()

        const study = await db
            .selectFrom('study')
            .selectAll('study')
            .where('id', '=', result.studyId)
            .executeTakeFirst()
        expect(study).toBeDefined()
        expect(study?.language).toEqual('PYTHON')
    })

    it('onDeleteStudyAction deletes a study', async () => {
        const { org } = await mockSessionWithTestData({ orgType: 'lab' })
        const { studyId } = await insertTestStudyData({ org })

        await onDeleteStudyAction({ studyId })

        const study = await db.selectFrom('study').selectAll('study').where('id', '=', studyId).executeTakeFirst()
        expect(study).toBeUndefined()

        expect(aws.deleteFolderContents).toHaveBeenCalledWith(`studies/${org.slug}/${studyId}`)
    })
})
