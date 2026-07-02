import { Routes } from '@/lib/routes'
import type { DashboardState } from './state.types'
import type { DashboardAction } from './screens'

export type DashboardRuleCtx = { orgSlug: string; studyId: string }
export type DashboardRule = {
    when: (s: DashboardState) => boolean
    action: (ctx: DashboardRuleCtx) => DashboardAction
}

// Mirrors useStudyHref: statuses whose study has been submitted for review (any outcome) but
// has no job activity yet → the submitted-confirmation page.
const POST_SUBMISSION_STATUSES: ReadonlyArray<DashboardState['status']> = [
    'PENDING-REVIEW',
    'APPROVED',
    'REJECTED',
    'CHANGE-REQUESTED',
]

export const DASHBOARD_RULES: DashboardRule[] = [
    // DRAFT that already reached Step 2 → resume on Step 2 (the proposal editor) instead of the
    // Step 1 data-partner picker (OTTER-572). Must precede the plain-DRAFT rule below.
    {
        when: (s) => s.isDraft && s.hasStep2Progress,
        action: (ctx) => ({ label: 'Edit', href: Routes.studyProposal(ctx), secondaryAction: 'delete-draft' }),
    },
    // DRAFT still on Step 1: edit, with a delete affordance (component still gates on author).
    {
        when: (s) => s.isDraft,
        action: (ctx) => ({ label: 'Edit', href: Routes.studyEdit(ctx), secondaryAction: 'delete-draft' }),
    },

    // Faithful to useStudyHref. Label stays "View" for every non-draft destination (matches the
    // current UI — the dashboard cell reads "View" even when it links to /code or /submitted).
    // 1. APPROVED with a job but code not yet submitted → the code upload page (labelled "View").
    {
        when: (s) => s.status === 'APPROVED' && s.hasAnyJob && !s.hasSubmittedCode,
        action: (ctx) => ({ label: 'View', href: Routes.studyCode(ctx) }),
    },
    // 2. Any job activity → the study view.
    { when: (s) => s.hasAnyJob, action: (ctx) => ({ label: 'View', href: Routes.studyView(ctx) }) },
    // 3. APPROVED, agreements acked, no job yet → start code upload.
    {
        when: (s) => s.status === 'APPROVED' && s.researcherAgreementsAcked,
        action: (ctx) => ({ label: 'View', href: Routes.studyCode(ctx) }),
    },
    // 4. Submitted-but-no-job proposal states → the submitted confirmation page.
    {
        when: (s) => POST_SUBMISSION_STATUSES.includes(s.status),
        action: (ctx) => ({ label: 'View', href: Routes.studySubmitted(ctx) }),
    },
    // 5. Fallback.
    { when: () => true, action: (ctx) => ({ label: 'View', href: Routes.studyView(ctx) }) },
]
