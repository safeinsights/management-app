import type { StudyRole, StudyState, DashboardState } from './state.types'
import type { ScreenDescriptor, DashboardAction } from './screens'
import type { ScreenRuleCtx } from './screen-rules'
import { RESEARCHER_SCREEN_RULES, researcherScreenRank, WIZARD_STEP_CAP } from './researcher-screen-rules'
import { asWizardStep } from './wizard-steps'
import { REVIEWER_SCREEN_RULES } from './reviewer-screen-rules'
import { DASHBOARD_RULES, type DashboardRuleCtx } from './dashboard-rules'

export function resolveScreen(
    role: StudyRole,
    state: StudyState,
    step: string | undefined,
    _ctx: ScreenRuleCtx,
): ScreenDescriptor {
    const rules = role === 'reviewer' ? REVIEWER_SCREEN_RULES : RESEARCHER_SCREEN_RULES

    // Capping the table at the step's rank only ever lets a researcher walk BACK to an earlier
    // screen: an unreached step yields no cap, and the rank-0 exhaustive fallback keeps the find
    // total, so the study can never jump ahead of its true state.
    const wizardStep = role === 'researcher' ? asWizardStep(step) : undefined
    const cap = wizardStep ? WIZARD_STEP_CAP[wizardStep] : undefined
    const [screen] = rules.find(
        ([id, rule]) => (cap === undefined || researcherScreenRank(id) <= cap) && rule.when(state),
    )!

    return wizardStep ? { screen, step: wizardStep } : { screen }
}

export function resolveDashboardAction(role: StudyRole, state: DashboardState, ctx: DashboardRuleCtx): DashboardAction {
    // researcher-only for now; reviewer dashboard link is unchanged in this plan.
    const rule = DASHBOARD_RULES.find((r) => r.when(state))!
    return rule.action(ctx)
}
