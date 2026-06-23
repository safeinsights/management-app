import type { StudyRole, StudyState, DashboardState } from './state.types'
import type { ScreenDescriptor, DashboardAction } from './screens'
import { SCREEN_RULES, type ScreenRuleCtx } from './screen-rules'
import { REVIEWER_SCREEN_RULES } from './reviewer-screen-rules'
import { DASHBOARD_RULES, type DashboardRuleCtx } from './dashboard-rules'

export function resolveScreen(
    role: StudyRole,
    state: StudyState,
    step: string | undefined,
    _ctx: ScreenRuleCtx,
): ScreenDescriptor {
    const rules = role === 'reviewer' ? REVIEWER_SCREEN_RULES : SCREEN_RULES
    const [screen] = rules.find(([, rule]) => rule.when(state))! // total: last entry is `when: () => true`
    return step ? { screen, step } : { screen }
}

export function resolveDashboardAction(role: StudyRole, state: DashboardState, ctx: DashboardRuleCtx): DashboardAction {
    // researcher-only for now; reviewer dashboard link is unchanged in this plan.
    const rule = DASHBOARD_RULES.find((r) => r.when(state))!
    return rule.action(ctx)
}
