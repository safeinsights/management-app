import type { StudyRole, StudyState, DashboardState } from './state.types'
import type { ScreenId, ScreenDescriptor, DashboardAction } from './screens'
import { RESEARCHER_SCREEN_RULES } from './researcher-screen-rules'
import { REVIEWER_SCREEN_RULES } from './reviewer-screen-rules'
import { DASHBOARD_RULES, type DashboardRuleCtx } from './dashboard-rules'

// Pure state → screen: the URL never influences which screen renders, so routing context is
// deliberately not a parameter here.
export function resolveScreen(role: StudyRole, state: StudyState): ScreenDescriptor {
    const rules = role === 'reviewer' ? REVIEWER_SCREEN_RULES : RESEARCHER_SCREEN_RULES
    const [screen] = rules.find(([, rule]) => rule.when(state))! // total: last entry is `when: () => true`
    return { screen }
}

const RESEARCHER_CODE_SCREENS: ReadonlyArray<ScreenId> = ['code-approved', 'code-feedback', 'code-under-review']

// undefined when the study hasn't reached the code stage, so a researcher can walk back to the
// code step but never jump ahead.
export function resolveResearcherCodeScreen(state: StudyState): ScreenDescriptor | undefined {
    const screen = RESEARCHER_SCREEN_RULES.find(
        ([id, rule]) => RESEARCHER_CODE_SCREENS.includes(id) && rule.when(state),
    )?.[0]
    return screen ? { screen } : undefined
}

const REVIEWER_CODE_SCREENS: ReadonlyArray<ScreenId> = ['reviewer-code-feedback', 'reviewer-code-review']

// Restricting the candidates to code-stage screens is what stops a decided study looping back to
// reviewer-outputs-decided, which out-ranks everything.
export function resolveReviewerCodeScreen(state: StudyState): ScreenDescriptor | undefined {
    const screen = REVIEWER_SCREEN_RULES.find(
        ([id, rule]) => REVIEWER_CODE_SCREENS.includes(id) && rule.when(state),
    )?.[0]
    return screen ? { screen, readOnlyCodeStep: true } : undefined
}

export function resolveDashboardAction(role: StudyRole, state: DashboardState, ctx: DashboardRuleCtx): DashboardAction {
    const rule = DASHBOARD_RULES.find((r) => r.when(state))!
    return rule.action(ctx)
}
