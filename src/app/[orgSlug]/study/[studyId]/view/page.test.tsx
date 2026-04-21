import { describe, it, expect } from 'vitest'
import * as RouterMock from 'next-router-mock'
import {
    insertTestStudyJobData,
    insertTestStudyOnly,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    userEvent,
    faker,
} from '@/tests/unit.helpers'
import { db } from '@/database'
import StudyReviewPage from './page'

const defaultSearchParams = Promise.resolve({})

describe('StudyViewPage', () => {
    it('renders CodeOnlyView when job has CODE-SUBMITTED', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, jobStatus: 'CODE-SUBMITTED' })

        const page = await StudyReviewPage({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            searchParams: defaultSearchParams,
        })
        renderWithProviders(page!)

        expect(screen.getByText('Previous')).toBeInTheDocument()
    })

    it('renders ResearcherProposalView when code is submitted but from=agreements is set', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, jobStatus: 'CODE-SUBMITTED' })

        const page = await StudyReviewPage({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            searchParams: Promise.resolve({ from: 'agreements' }),
        })
        renderWithProviders(page!)

        // Proposal view shows STEP 2 / "Study proposal" and the Proceed button back to agreements.
        expect(screen.getByText('STEP 2')).toBeInTheDocument()
        expect(screen.getByText('Study proposal')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Proceed to Step 3' })).toBeInTheDocument()
    })

    it('renders ResearcherProposalView for APPROVED study without job', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })

        const page = await StudyReviewPage({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            searchParams: defaultSearchParams,
        })
        renderWithProviders(page!)

        expect(screen.getByText('STEP 2')).toBeInTheDocument()
        expect(screen.getByText('Study proposal')).toBeInTheDocument()
        expect(screen.queryByText('No code has been uploaded yet.')).not.toBeInTheDocument()
    })

    it('renders ResearcherProposalView with agreementsHref when from=agreements', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })

        const page = await StudyReviewPage({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            searchParams: Promise.resolve({ from: 'agreements' }),
        })
        renderWithProviders(page!)

        expect(screen.getByRole('button', { name: 'Proceed to Step 3' })).toBeInTheDocument()
    })

    it('agreementsHref preserves returnTo=org through the proposal view', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })

        const page = await StudyReviewPage({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            searchParams: Promise.resolve({ from: 'agreements', returnTo: 'org' }),
        })
        renderWithProviders(page!)

        const interact = userEvent.setup()
        await interact.click(screen.getByRole('button', { name: 'Proceed to Step 3' }))

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { asPath } = (RouterMock as any).memoryRouter
        expect(asPath).toContain(`/${org.slug}/study/${study.id}/agreements`)
        expect(asPath).toContain('returnTo=org')
    })

    it('renders ResearcherProposalView without agreementsHref when from is absent', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })

        const page = await StudyReviewPage({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            searchParams: defaultSearchParams,
        })
        renderWithProviders(page!)

        expect(screen.queryByRole('button', { name: 'Proceed to Step 3' })).not.toBeInTheDocument()
    })

    it('renders ResearcherProposalView for REJECTED study', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
        await db.updateTable('study').set({ status: 'REJECTED' }).where('id', '=', study.id).execute()

        const page = await StudyReviewPage({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            searchParams: defaultSearchParams,
        })
        renderWithProviders(page!)

        expect(screen.getByText('STEP 2')).toBeInTheDocument()
        expect(screen.getByText('Study proposal')).toBeInTheDocument()
    })

    it('renders generic layout for DRAFT study without job', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
        await db.updateTable('study').set({ status: 'DRAFT' }).where('id', '=', study.id).execute()

        const page = await StudyReviewPage({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            searchParams: defaultSearchParams,
        })
        renderWithProviders(page!)

        expect(screen.getByText('Study Details')).toBeInTheDocument()
        expect(screen.getByText('No code has been uploaded yet.')).toBeInTheDocument()
    })

    it('throws when study does not exist', async () => {
        await mockSessionWithTestData({ orgType: 'lab' })

        await expect(
            StudyReviewPage({
                params: Promise.resolve({ orgSlug: 'test-org', studyId: faker.string.uuid() }),
                searchParams: defaultSearchParams,
            }),
        ).rejects.toThrow()
    })
})
