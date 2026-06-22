import { Routes } from '@/lib/routes'
import type { DashboardState } from './state.types'
import type { DashboardAction } from './screens'

export type DashboardRuleCtx = { orgSlug: string; studyId: string }
export type DashboardRule = {
    when: (s: DashboardState) => boolean
    action: (ctx: DashboardRuleCtx) => DashboardAction
}

export const DASHBOARD_RULES: DashboardRule[] = [
    {
        when: (s) => s.isDraft,
        action: (ctx) => ({ label: 'Edit', href: Routes.studyEdit(ctx), secondaryAction: 'delete-draft' }),
    },
    {
        when: (s) => s.status === 'APPROVED' && s.hasAnyJob && !s.hasSubmittedCode,
        action: (ctx) => ({ label: 'Continue upload', href: Routes.studyCode(ctx) }),
    },
    { when: () => true, action: (ctx) => ({ label: 'View', href: Routes.studyView(ctx) }) },
]
