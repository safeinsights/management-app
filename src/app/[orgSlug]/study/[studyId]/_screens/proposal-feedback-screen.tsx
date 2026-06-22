import { ResearcherProposalView } from '../view/researcher-proposal-view'
import type { ScreenComponentProps } from './types'

// proposal-feedback: read-only proposal. The machine supplies the forward target (e.g. the
// agreements step or edit-and-resubmit) via descriptor.forward; we feed its route href to the
// view's existing "Proceed" button. No ?from= — the href is a plain route the machine computed.
export function ProposalFeedbackScreen({ descriptor, study, orgSlug, dashboardHref }: ScreenComponentProps) {
    const forwardHref = descriptor.forward?.target.kind === 'route' ? descriptor.forward.target.href : undefined
    return (
        <ResearcherProposalView
            orgSlug={orgSlug}
            study={study}
            agreementsHref={forwardHref}
            dashboardHref={dashboardHref}
        />
    )
}
