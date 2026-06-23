import { Routes } from '@/lib/routes'
import { projectStudyState } from '@/lib/study-screen'
import { ResearcherProposalView } from '../view/researcher-proposal-view'
import type { ScreenComponentProps } from './types'

// proposal-feedback: read-only proposal (REJECTED / APPROVED / CHANGE-REQUESTED, no code submitted).
// Only an APPROVED study with no code yet gets the forward "Proceed to Step 3" → agreements; the
// CHANGE-REQUESTED "Edit and resubmit" CTA lives on /submitted, and REJECTED is terminal.
export function ProposalFeedbackScreen({ study, raw, orgSlug, dashboardHref, returnTo }: ScreenComponentProps) {
    const state = projectStudyState(raw)
    const showProceed = state.status === 'APPROVED' && !state.hasSubmittedCode
    const agreementsHref = showProceed ? Routes.studyAgreements({ orgSlug, studyId: study.id, returnTo }) : undefined

    return (
        <ResearcherProposalView
            orgSlug={orgSlug}
            study={study}
            dashboardHref={dashboardHref}
            agreementsHref={agreementsHref}
        />
    )
}
