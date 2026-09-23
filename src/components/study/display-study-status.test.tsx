import { describe, expect, it } from 'vitest'
import { renderWithProviders, screen, userEvent } from '@/tests/unit.helpers'
import { DisplayStudyStatus } from '@/components/study/display-study-status'
import { resolvePillPresentation, type PillContext, type PillId } from '@/lib/status-labels'

const NAMES = { dataPartner: 'Openstax', researchLab: 'Openstax Lab' }
const label = (id: PillId, role: PillContext['role'] = 'researcher') => resolvePillPresentation(id, { role, ...NAMES })

describe('DisplayStudyStatus', () => {
    const cases: Array<[PillId, string]> = [
        ['proposal-draft', 'Proposal draft'],
        ['proposal-submitted', 'Proposal submitted'],
        ['proposal-needs-review', 'Proposal needs review'],
        ['proposal-needs-revision', 'Proposal needs revision'],
        ['proposal-revision-requested', 'Proposal revision requested'],
        ['proposal-approved', 'Proposal approved'],
        ['proposal-declined', 'Proposal declined'],
        ['code-draft', 'Code draft'],
        ['code-awaiting', 'Awaiting code'],
        ['code-submitted', 'Code submitted'],
        ['code-needs-review', 'Code needs review'],
        ['code-needs-revision', 'Code needs revision'],
        ['code-revision-requested', 'Code revision requested'],
        ['code-approved', 'Code approved'],
        ['code-declined', 'Code declined'],
        ['code-processing', 'Code processing'],
        ['code-preparing', 'Preparing code'],
        ['code-queued', 'Code queued'],
        ['code-running', 'Code running'],
        ['code-errored', 'Code errored'],
        ['outputs-awaiting', 'Awaiting outputs'],
        ['outputs-need-review', 'Outputs need review'],
        ['outputs-reviewed', 'Outputs reviewed'],
    ]

    it.each(cases)('renders %s as "%s"', (id, expectedText) => {
        renderWithProviders(<DisplayStudyStatus status={label(id)} />)
        const textEl = screen.getByText(expectedText)
        expect(textEl.textContent?.trim()).toBe(expectedText)
    })

    it('shows the tooltip on hover, with the organization name filled in', async () => {
        const user = userEvent.setup()
        renderWithProviders(<DisplayStudyStatus status={label('code-submitted')} />)

        await user.hover(screen.getByText('Code submitted'))

        expect(await screen.findByText('Waiting for Openstax to review code.')).toBeVisible()
    })

    it('addresses each role differently on a badge they share', async () => {
        const user = userEvent.setup()
        renderWithProviders(<DisplayStudyStatus status={label('code-errored', 'reviewer')} />)

        await user.hover(screen.getByText('Code errored'))

        expect(await screen.findByText('Code run failed. Review the logs and share feedback.')).toBeVisible()
    })
})
