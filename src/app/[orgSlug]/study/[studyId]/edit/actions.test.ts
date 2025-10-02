import { describe, expect, it } from 'vitest'
import { mockSessionWithTestData, insertTestStudyData } from '@/tests/unit.helpers'
import { onUpdateStudyAction } from './actions'
import { db } from '@/database'

describe('Edit Study Actions', () => {
    it('onUpdateStudyAction updates a study', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'lab' })
        const { studyId } = await insertTestStudyData({ org, researcherId: user.id })

        const updatedStudyData = {
            title: 'Updated Study Title',
            piName: 'New PI Name',
            outputMimeType: 'application/json',
            eventCapture: true,
            highlights: false,
            containerLocation: 'new-location',
            irbDocument: 'new-irb-doc',
        }

        await onUpdateStudyAction({ studyId, study: updatedStudyData })

        const updatedStudy = await db
            .selectFrom('study')
            .selectAll('study')
            .where('id', '=', studyId)
            .executeTakeFirst()

        expect(updatedStudy).toBeDefined()
        expect(updatedStudy?.piName).toEqual(updatedStudyData.piName)
        expect(updatedStudy?.outputMimeType).toEqual(updatedStudyData.outputMimeType)
        expect(updatedStudy?.dataSources).toEqual(['eventCapture', 'containerURL', 'IRB Document.pdf'])
    })
})
