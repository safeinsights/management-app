import type { StudyRole, StudyState, DashboardState } from './state.types'
import type { ScreenDescriptor, DashboardAction } from './screens'
import { SCREEN_RULES, type ScreenRuleCtx } from './screen-rules'
import { DASHBOARD_RULES, type DashboardRuleCtx } from './dashboard-rules'

export function resolveScreen(
    role: StudyRole,
    state: StudyState,
    step: string | undefined,
    ctx: ScreenRuleCtx,
): ScreenDescriptor {
    // Reviewer rules are not yet implemented (spec §13). Until then, reviewer falls through to
    // the researcher table's fallback so callers never crash; the reviewer page is NOT migrated
    // in this plan and does not call resolveScreen.
    const rules = SCREEN_RULES
    const rule = rules.find((r) => r.when(state))! // total: the last rule is `when: () => true`
    const descriptor = rule.screen(state, ctx)
    // Per spec §9, an explicit URL `step` overrides the descriptor's default step. Validating a
    // step against the screen's allowed steps belongs with the multi-step screen work (deferred).
    // No screen consumes `step` in this plan, so a passthrough is correct and sufficient here.
    return step ? { ...descriptor, step } : descriptor
}

export function resolveDashboardAction(role: StudyRole, state: DashboardState, ctx: DashboardRuleCtx): DashboardAction {
    // researcher-only for now; reviewer dashboard link is unchanged in this plan.
    const rule = DASHBOARD_RULES.find((r) => r.when(state))!
    return rule.action(ctx)
}
