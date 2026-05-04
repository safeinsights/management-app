import { renderWithProviders, screen } from '@/tests/unit.helpers'
import { setupStudyAction } from '@/tests/db-action.helpers'
import { useParams } from 'next/navigation'
import { type Mock, describe, expect, it } from 'vitest'
import { CodeReviewView } from './code-review-view'

describe('CodeReviewView', () => {
    it('renders Study Code section', async () => {
        const { org, study } = await setupStudyAction({ orgSlug: 'openstax', orgType: 'enclave' })
        ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })

        renderWithProviders(await CodeReviewView({ orgSlug: org.slug, study }))

        expect(screen.getByText('Study Code')).toBeInTheDocument()
    })

    it('does NOT render Study Proposal section', async () => {
        const { org, study } = await setupStudyAction({ orgSlug: 'openstax', orgType: 'enclave' })
        ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })

        renderWithProviders(await CodeReviewView({ orgSlug: org.slug, study }))

        expect(screen.queryByText('Study Proposal')).not.toBeInTheDocument()
    })

    it('renders StudyResultsWithReview', async () => {
        const { org, study } = await setupStudyAction({ orgSlug: 'openstax', orgType: 'enclave' })
        ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })

        renderWithProviders(await CodeReviewView({ orgSlug: org.slug, study }))

        expect(screen.getByText('Study Status')).toBeInTheDocument()
    })

    it('renders the not-found alert when the study has no submitted job', async () => {
        const { org, study } = await setupStudyAction({ orgSlug: 'regular-org', orgType: 'enclave', createJob: false })
        ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })

        renderWithProviders(await CodeReviewView({ orgSlug: org.slug, study }))

        expect(screen.getByText('No submission found')).toBeInTheDocument()
    })

    it('renders Previous button linking to proposal view', async () => {
        const { org, study } = await setupStudyAction({ orgSlug: 'openstax', orgType: 'enclave' })
        ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })

        renderWithProviders(await CodeReviewView({ orgSlug: org.slug, study }))

        const previousButton = screen.getByRole('link', { name: /previous/i })
        expect(previousButton).toBeInTheDocument()
        expect(previousButton).toHaveAttribute('href', expect.stringContaining('/agreements?from=previous'))
    })
})
