import type { StudyRole, StudyState, DashboardState } from './state.types'
import type { ScreenDescriptor, DashboardAction } from './screens'
import type { ScreenRuleCtx } from './screen-rules'
import { RESEARCHER_SCREEN_RULES, researcherScreenRank, wizardStepCap } from './researcher-screen-rules'
import { REVIEWER_SCREEN_RULES } from './reviewer-screen-rules'
import { DASHBOARD_RULES, type DashboardRuleCtx } from './dashboard-rules'

export function resolveScreen(
    role: StudyRole,
    state: StudyState,
    step: string | undefined,
    _ctx: ScreenRuleCtx,
): ScreenDescriptor {
    const rules = role === 'reviewer' ? REVIEWER_SCREEN_RULES : RESEARCHER_SCREEN_RULES

    // `step` (researcher only) lets the read-only wizard revisit an earlier screen of an advanced
    // study. Cap the table at the step's rank and take the highest-precedence rule at or below it;
    // an unreached/unknown step has no effect, so the study can never jump ahead of its true state.
    const cap = role === 'researcher' ? wizardStepCap(step) : undefined
    const match =
        cap === undefined
            ? rules.find(([, rule]) => rule.when(state))!
            : (rules.find(([screen, rule]) => researcherScreenRank(screen) <= cap && rule.when(state)) ??
              rules.find(([, rule]) => rule.when(state))!) // total: last entry is `when: () => true`

    const [screen] = match
    return step ? { screen, step } : { screen }
}

export function resolveDashboardAction(role: StudyRole, state: DashboardState, ctx: DashboardRuleCtx): DashboardAction {
    // researcher-only for now; reviewer dashboard link is unchanged in this plan.
    const rule = DASHBOARD_RULES.find((r) => r.when(state))!
    return rule.action(ctx)
}
