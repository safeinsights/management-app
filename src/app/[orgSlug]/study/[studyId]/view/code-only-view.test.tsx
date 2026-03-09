import { db, renderWithProviders, screen, waitFor } from '@/tests/unit.helpers'
import { setupStudyAction } from '@/tests/db-action.helpers'
import { describe, expect, it } from 'vitest'
import { CodeOnlyView } from './code-only-view'

async function waitForCodeDetailsToLoad() {
    await waitFor(() => {
        expect(screen.queryByText('Loading files...')).not.toBeInTheDocument()
    })
}

describe('CodeOnlyView', () => {
    it('renders real uploaded code details', async () => {
        const { org, study, latestJob } = await setupStudyAction({ orgSlug: 'openstax', orgType: 'lab' })

        await db
            .insertInto('studyJobFile')
            .values([
                {
                    studyJobId: latestJob!.id,
                    name: 'main.R',
                    path: `${org.slug}/${study.id}/${latestJob!.id}/main.R`,
                    fileType: 'MAIN-CODE',
                },
                {
                    studyJobId: latestJob!.id,
                    name: 'helper.R',
                    path: `${org.slug}/${study.id}/${latestJob!.id}/helper.R`,
                    fileType: 'SUPPLEMENTAL-CODE',
                },
            ])
            .execute()

        renderWithProviders(<CodeOnlyView orgSlug={org.slug} study={study} job={latestJob!} />)

        expect(screen.getByText('Study Code')).toBeInTheDocument()
        await waitForCodeDetailsToLoad()

        expect(screen.getByText('Main code file:')).toBeInTheDocument()
        expect(screen.getByText('main.R')).toBeInTheDocument()
        expect(screen.getByText('Additional file(s):')).toBeInTheDocument()
        expect(screen.getByText('helper.R')).toBeInTheDocument()
    })

    it('renders real job status message', async () => {
        const { org, study, latestJob } = await setupStudyAction({ orgSlug: 'openstax', orgType: 'lab' })

        renderWithProviders(<CodeOnlyView orgSlug={org.slug} study={study} job={latestJob!} />)
        await waitForCodeDetailsToLoad()

        expect(
            screen.getByText(
                'Study results will become available once the data organization reviews and approves them.',
            ),
        ).toBeInTheDocument()
    })

    it('renders Previous button linking to Agreements', async () => {
        const { org, study, latestJob } = await setupStudyAction({ orgSlug: 'openstax', orgType: 'lab' })

        renderWithProviders(<CodeOnlyView orgSlug={org.slug} study={study} job={latestJob!} />)
        await waitForCodeDetailsToLoad()

        const previousButton = screen.getByRole('link', { name: /previous/i })
        expect(previousButton).toBeInTheDocument()
        expect(previousButton).toHaveAttribute('href', expect.stringContaining('/agreements'))
    })
})
