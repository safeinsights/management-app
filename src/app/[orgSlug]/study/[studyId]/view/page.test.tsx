import { Suspense } from 'react'
import { describe, it, expect } from 'vitest'
import {
    act,
    insertTestStudyJobData,
    insertTestStudyOnly,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    faker,
    waitFor,
} from '@/tests/unit.helpers'
import StudyReviewPage from './page'

describe('StudyViewPage', () => {
    it('renders CodeOnlyView when job exists', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id })

        const page = await StudyReviewPage({ params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }) })
        renderWithProviders(page!)

        expect(screen.getByText('Previous')).toBeInTheDocument()
    })

    it('renders full details when no job exists', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })

        const page = await StudyReviewPage({ params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }) })
        await act(async () => {
            renderWithProviders(<Suspense fallback={<div>Loading...</div>}>{page!}</Suspense>)
        })

        await waitFor(() => {
            expect(screen.getByText('Study Name')).toBeInTheDocument()
        })

        expect(screen.getByText('Study Proposal')).toBeInTheDocument()
        expect(screen.getByText(study.title)).toBeInTheDocument()
        expect(screen.getByText('Principal investigator')).toBeInTheDocument()
        expect(screen.queryByText('Previous')).not.toBeInTheDocument()
        expect(screen.getByText('No code has been uploaded yet.')).toBeInTheDocument()
    })

    it('throws when study does not exist', async () => {
        await mockSessionWithTestData({ orgType: 'lab' })

        await expect(
            StudyReviewPage({
                params: Promise.resolve({ orgSlug: 'test-org', studyId: faker.string.uuid() }),
            }),
        ).rejects.toThrow()
    })
})
