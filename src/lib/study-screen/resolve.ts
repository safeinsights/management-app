import type { StudyRole, StudyState, DashboardState } from './state.types'
import type { ScreenId, ScreenDescriptor, DashboardAction } from './screens'
import type { ScreenRuleCtx } from './screen-rules'
import { RESEARCHER_SCREEN_RULES } from './researcher-screen-rules'
import { REVIEWER_SCREEN_RULES } from './reviewer-screen-rules'
import { DASHBOARD_RULES, type DashboardRuleCtx } from './dashboard-rules'

// Pure state → screen: the URL never influences which screen renders. Walking back to an earlier
// screen of an advanced study is addressed by its own route instead (see resolveResearcherCodeScreen).
export function resolveScreen(role: StudyRole, state: StudyState, _ctx: ScreenRuleCtx): ScreenDescriptor {
    const rules = role === 'reviewer' ? REVIEWER_SCREEN_RULES : RESEARCHER_SCREEN_RULES
    const [screen] = rules.find(([, rule]) => rule.when(state))! // total: last entry is `when: () => true`
    return { screen }
}

const RESEARCHER_CODE_SCREENS: ReadonlyArray<ScreenId> = ['code-approved', 'code-feedback', 'code-under-review']

// The code screen for the read-only /view/code route, reusing the table's own predicates. undefined
// when the study hasn't reached the code stage (route 404s), so a researcher can walk back to the
// code step but never jump ahead.
export function resolveResearcherCodeScreen(state: StudyState): ScreenId | undefined {
    return RESEARCHER_SCREEN_RULES.find(([id, rule]) => RESEARCHER_CODE_SCREENS.includes(id) && rule.when(state))?.[0]
}

export function resolveDashboardAction(role: StudyRole, state: DashboardState, ctx: DashboardRuleCtx): DashboardAction {
    // researcher-only for now; reviewer dashboard link is unchanged in this plan.
    const rule = DASHBOARD_RULES.find((r) => r.when(state))!
    return rule.action(ctx)
}
