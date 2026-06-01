import { renderWithProviders, screen } from '@/tests/unit.helpers'
import { setupStudyAction } from '@/tests/db-action.helpers'
import { useParams } from 'next/navigation'
import { type Mock, describe, expect, it } from 'vitest'
import { StudyDetailsReviewer } from './study-details-reviewer'

// OTTER-538: server-side smoke tests for the new DO Study Details page —
// it drops the Study Code section and points "Previous" at the OTTER-552
// post-code-feedback page (i.e. /review?from=code-review).

describe('StudyDetailsReviewer', () => {
    it('omits the Study Code section', async () => {
        const { org, study } = await setupStudyAction({ orgSlug: 'openstax', orgType: 'enclave' })
        ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })

        renderWithProviders(await StudyDetailsReviewer({ orgSlug: org.slug, study }))

        expect(screen.queryByText('Study Code')).not.toBeInTheDocument()
        expect(screen.getByText('Study Status')).toBeInTheDocument()
    })

    it('renders the not-found alert when the study has no submitted job', async () => {
        const { org, study } = await setupStudyAction({ orgSlug: 'regular-org', orgType: 'enclave', createJob: false })
        ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })

        renderWithProviders(await StudyDetailsReviewer({ orgSlug: org.slug, study }))

        expect(screen.getByText('No submission found')).toBeInTheDocument()
    })

    it('routes Previous back to the post-code-feedback page (OTTER-552)', async () => {
        const { org, study } = await setupStudyAction({ orgSlug: 'openstax', orgType: 'enclave' })
        ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })

        renderWithProviders(await StudyDetailsReviewer({ orgSlug: org.slug, study }))

        const previousButton = screen.getByRole('link', { name: /previous/i })
        expect(previousButton).toHaveAttribute('href', expect.stringContaining('/review?from=code-review'))
    })
})
