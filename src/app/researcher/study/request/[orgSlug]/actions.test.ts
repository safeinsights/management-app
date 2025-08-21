import { describe, expect, it, vi } from 'vitest'
import { mockSessionWithTestData, insertTestStudyData } from '@/tests/unit.helpers'
import { upsertStudyAction, onDeleteStudyAction } from './actions'
import { db } from '@/database'
import * as aws from '@/server/aws'

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
        const { org } = await mockSessionWithTestData({ isResearcher: true })

        const studyInfo = {
            title: 'Test Study',
            piName: 'Test PI',
            descriptionDocPath: 'test-desc.pdf',
            irbDocPath: 'test-irb.pdf',
            agreementDocPath: 'test-agreement.pdf',
            mainCodeFilePath: 'main.R',
            additionalCodeFilePaths: ['helpers.R'],
        }

        const result = await upsertStudyAction({
            orgSlug: org.slug,
            studyInfo,
            mainCodeFileName: 'main.R',
            codeFileNames: ['helpers.R'],
        })

        expect(result.studyId).toBeDefined()
        expect(result.studyJobId).toBeDefined()

        const study = await db
            .selectFrom('study')
            .selectAll('study')
            .where('id', '=', result.studyId)
            .executeTakeFirst()
        expect(study).toBeDefined()
        expect(study?.title).toEqual(studyInfo.title)
    })

    it('onDeleteStudyAction deletes a study', async () => {
        const { org } = await mockSessionWithTestData({ isResearcher: true })
        const { studyId, jobs } = await insertTestStudyData({ org })
        const studyJobId = jobs[0].id

        await onDeleteStudyAction({ orgSlug: org.slug, studyId, studyJobId })

        const study = await db.selectFrom('study').selectAll('study').where('id', '=', studyId).executeTakeFirst()
        expect(study).toBeUndefined()

        expect(aws.deleteFolderContents).toHaveBeenCalledWith(`studies/${org.slug}/${studyId}`)
    })
})
