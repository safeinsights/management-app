import { Routes } from '@/lib/routes'
import type { DashboardState } from './state.types'
import type { DashboardAction } from './screens'

export type DashboardRuleCtx = { orgSlug: string; studyId: string }
export type DashboardRule = {
    when: (s: DashboardState) => boolean
    action: (ctx: DashboardRuleCtx) => DashboardAction
}

export const DASHBOARD_RULES: DashboardRule[] = [
    // DRAFT: edit, with a delete affordance (component still gates on author).
    {
        when: (s) => s.isDraft,
        action: (ctx) => ({ label: 'Edit', href: Routes.studyEdit(ctx), secondaryAction: 'delete-draft' }),
    },

    // Faithful to useStudyHref. Label stays "View" for every non-draft destination (matches the
    // current UI — the dashboard cell reads "View" even when it links to /code or /submitted).
    // 1. APPROVED with a job but code not yet submitted → continue uploading.
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
        when: (s) =>
            s.status === 'PENDING-REVIEW' ||
            s.status === 'APPROVED' ||
            s.status === 'REJECTED' ||
            s.status === 'CHANGE-REQUESTED',
        action: (ctx) => ({ label: 'View', href: Routes.studySubmitted(ctx) }),
    },
    // 5. Fallback.
    { when: () => true, action: (ctx) => ({ label: 'View', href: Routes.studyView(ctx) }) },
]
