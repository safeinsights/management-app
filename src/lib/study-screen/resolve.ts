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
export function resolveResearcherCodeScreen(state: StudyState): ScreenDescriptor | undefined {
    const screen = RESEARCHER_SCREEN_RULES.find(
        ([id, rule]) => RESEARCHER_CODE_SCREENS.includes(id) && rule.when(state),
    )?.[0]
    return screen ? { screen } : undefined
}

const REVIEWER_CODE_SCREENS: ReadonlyArray<ScreenId> = [
    'reviewer-code-feedback',
    'reviewer-agreements',
    'reviewer-code-review',
]

// Reviewer counterpart to resolveResearcherCodeScreen, for the read-only /review/code route a DO walks
// back to from the results screen. Excluding reviewer-study-results from the candidate set is the whole
// point: a results study keeps codeDecision === 'CODE-APPROVED', so re-running the table's own predicates
// over just the code-stage screens lands on reviewer-code-feedback instead of looping back to results
// (which out-ranks everything in REVIEWER_SCREEN_RULES). undefined when the study hasn't reached code yet,
// so the route 404s rather than jumping forward.
export function resolveReviewerCodeScreen(state: StudyState): ScreenDescriptor | undefined {
    const screen = REVIEWER_SCREEN_RULES.find(
        ([id, rule]) => REVIEWER_CODE_SCREENS.includes(id) && rule.when(state),
    )?.[0]
    return screen ? { screen, readOnlyCodeStep: true } : undefined
}

export function resolveDashboardAction(role: StudyRole, state: DashboardState, ctx: DashboardRuleCtx): DashboardAction {
    // researcher-only for now; reviewer dashboard link is unchanged in this plan.
    const rule = DASHBOARD_RULES.find((r) => r.when(state))!
    return rule.action(ctx)
}
