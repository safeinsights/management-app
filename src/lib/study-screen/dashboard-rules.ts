import { Routes } from '@/lib/routes'
import type { DashboardState } from './state.types'
import type { DashboardAction } from './screens'

export type DashboardRuleCtx = { orgSlug: string; studyId: string }
export type DashboardRule = {
    when: (s: DashboardState) => boolean
    action: (ctx: DashboardRuleCtx) => DashboardAction
}

const POST_SUBMISSION_STATUSES: ReadonlyArray<DashboardState['status']> = [
    'PENDING-REVIEW',
    'APPROVED',
    'REJECTED',
    'CHANGE-REQUESTED',
]

export const DASHBOARD_RULES: DashboardRule[] = [
    // Must precede the plain-DRAFT rule below (OTTER-572).
    {
        when: (s) => s.isDraft && s.hasStep2Progress,
        action: (ctx) => ({ href: Routes.studyProposal(ctx), secondaryAction: 'delete-draft' }),
    },
    {
        when: (s) => s.isDraft,
        action: (ctx) => ({ href: Routes.studyEdit(ctx), secondaryAction: 'delete-draft' }),
    },

    {
        when: (s) => s.status === 'APPROVED' && s.hasAnyJob && !s.hasSubmittedCode,
        action: (ctx) => ({ href: Routes.studyCode(ctx) }),
    },
    { when: (s) => s.hasAnyJob, action: (ctx) => ({ href: Routes.studyView(ctx) }) },
    {
        when: (s) => s.status === 'APPROVED' && s.researcherAgreementsAcked,
        action: (ctx) => ({ href: Routes.studyCode(ctx) }),
    },
    {
        when: (s) => POST_SUBMISSION_STATUSES.includes(s.status),
        action: (ctx) => ({ href: Routes.studySubmitted(ctx) }),
    },
    { when: () => true, action: (ctx) => ({ href: Routes.studyView(ctx) }) },
]
