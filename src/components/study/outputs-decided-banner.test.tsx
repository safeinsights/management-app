import { describe, expect, it } from 'vitest'
import dayjs from 'dayjs'
import { renderWithProviders, screen } from '@/tests/unit.helpers'
import { OutputsDecidedBanner } from './outputs-decided-banner'

const labName = 'Acme Research Lab'
const decidedAt = new Date('2026-07-15T14:30:00Z')
const formattedDate = dayjs(decidedAt).format('MMM DD, YYYY')

describe('OutputsDecidedBanner', () => {
    it('errored + outputs shared: shows errored title with outputs-and-feedback copy', async () => {
        renderWithProviders(
            <OutputsDecidedBanner resultsErrored resultsApproved labName={labName} decidedAt={decidedAt} />,
        )

        const alert = screen.getByTestId('status-alert')
        expect(alert).toHaveTextContent(`Code errored. Outputs and feedback shared • ${formattedDate}`)
        expect(alert).toHaveTextContent(
            `The study code failed to process. Outputs and feedback have been shared with ${labName}. We will notify you when they resubmit.`,
        )
        expect(alert).toHaveAttribute('data-variant', 'informative')
    })

    it('errored + feedback only: shows errored title with feedback-only copy', async () => {
        renderWithProviders(
            <OutputsDecidedBanner resultsErrored resultsApproved={false} labName={labName} decidedAt={decidedAt} />,
        )

        const alert = screen.getByTestId('status-alert')
        expect(alert).toHaveTextContent(`Code errored. Feedback shared • ${formattedDate}`)
        expect(alert).toHaveTextContent(
            `The study code failed to process. Feedback has been shared with ${labName} without the outputs. We will notify you when they resubmit.`,
        )
    })

    it('available + outputs shared: shows outputs-and-feedback title without errored prefix', async () => {
        renderWithProviders(
            <OutputsDecidedBanner resultsErrored={false} resultsApproved labName={labName} decidedAt={decidedAt} />,
        )

        const alert = screen.getByTestId('status-alert')
        expect(alert).toHaveTextContent(`Outputs and feedback shared • ${formattedDate}`)
        expect(alert).not.toHaveTextContent('Code errored')
        expect(alert).toHaveTextContent(
            `The outputs from the latest code run were reviewed and shared with ${labName} along with your feedback.`,
        )
    })

    it('available + feedback only: shows feedback-shared title without errored prefix', async () => {
        renderWithProviders(
            <OutputsDecidedBanner
                resultsErrored={false}
                resultsApproved={false}
                labName={labName}
                decidedAt={decidedAt}
            />,
        )

        const alert = screen.getByTestId('status-alert')
        expect(alert).toHaveTextContent(`Feedback shared • ${formattedDate}`)
        expect(alert).not.toHaveTextContent('Code errored')
        expect(alert).toHaveTextContent(
            `Feedback has been shared with ${labName} without the outputs. We will notify you when they resubmit.`,
        )
    })

    it('degrades to an undated banner when decidedAt is null', async () => {
        renderWithProviders(
            <OutputsDecidedBanner resultsErrored={false} resultsApproved labName={labName} decidedAt={null} />,
        )

        const alert = screen.getByTestId('status-alert')
        expect(alert).toHaveTextContent('Outputs and feedback shared')
        expect(alert).not.toHaveTextContent('•')
    })

    it('all 4 variants use the informative (purple) variant', async () => {
        const cases = [
            { resultsErrored: true, resultsApproved: true },
            { resultsErrored: true, resultsApproved: false },
            { resultsErrored: false, resultsApproved: true },
            { resultsErrored: false, resultsApproved: false },
        ] as const

        for (const { resultsErrored, resultsApproved } of cases) {
            const { unmount } = renderWithProviders(
                <OutputsDecidedBanner
                    resultsErrored={resultsErrored}
                    resultsApproved={resultsApproved}
                    labName={labName}
                    decidedAt={decidedAt}
                />,
            )
            expect(screen.getByTestId('status-alert')).toHaveAttribute('data-variant', 'informative')
            unmount()
        }
    })
})
