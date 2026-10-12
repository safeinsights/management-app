import { describe, it, expect } from 'vitest'
import {
    insertTestStudyOnly,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    setTestStudyStatus,
} from '@/tests/unit.helpers'
import { Routes } from '@/lib/routes'
import StudySubmittedRoute from './page'

describe('StudySubmittedRoute (/submitted)', () => {
    it('exits "Back to my studies" to My studies for a declined proposal', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
        await setTestStudyStatus(study.id, 'REJECTED')

        const page = await StudySubmittedRoute({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
        })
        renderWithProviders(page)

        expect(screen.getByTestId('cta-back-to-my-studies')).toHaveAttribute('href', Routes.dashboard)
    })
})
