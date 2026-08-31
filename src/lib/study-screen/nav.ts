import type { Route } from 'next'
import { Routes } from '@/lib/routes'
import type { ResearcherScreenId } from './screens'
import type { StudyState } from './state.types'
import { canResearcherResubmitCode } from './eligibility'
import { hasNextStepFromCode } from './next-step'

// In-content step navigation (OTTER-673). The spec ("Otter - Front-End Logic" § Navigation) reduces
// every step page to one of three button patterns, picked by a single question: can the user move
// forward from here?
//
//   1. forward exists  — task unfinished, finishing it is the way forward   [Previous] [Submit …]
//   2. forward open    — step done, the user is revisiting                  [Previous] [Next step]
//   3. forward blocked — waiting on the other party, or terminal            [Previous] [Back to my studies]
//
// Pattern 3 elevates the exit into the solid slot precisely BECAUSE there is no forward action, so no
// screen is ever a dead end. Researcher (Research Lab) screens only; the Data Partner half follows
// with the card that converts those views, so the table and the screens land together.

export type NavVariant = 'solid' | 'outline' | 'subtle'

export type NavAction = {
    label: string
    href: Route
    variant: NavVariant
    testId: string
}

// Every slot is optional: the spec suppresses "Previous step" on the first step of a flow, a draft
// carries its forward action in the wizard footer rather than the step nav, and only the terminal
// results screen fills the outline slot.
export type StepNav = {
    back?: NavAction
    secondary?: NavAction
    forward?: NavAction
}

export type NavCtx = {
    orgSlug: string
    studyId: string
    // Resolved upstream (org-scoped vs personal dashboard) so the nav table stays free of that branch.
    dashboardHref: Route
    returnTo?: 'org'
}

type NavRule = (state: StudyState, ctx: NavCtx) => StepNav

const previousStep = (href: Route): NavAction => ({
    label: 'Previous step',
    href,
    variant: 'subtle',
    testId: 'cta-previous-step',
})

const nextStep = (href: Route): NavAction => ({
    label: 'Next step',
    href,
    variant: 'solid',
    testId: 'cta-next-step',
})

// Always "My studies", never the user's entry point. Deliberate for beta: entry-point routing would
// need per-study tracking kept correct across every state, and the primary nav is due for rework right
// after beta (spec § "Back to my studies for beta: why the lighter lift").
const backToMyStudies = (ctx: NavCtx): NavAction => ({
    label: 'Back to my studies',
    href: ctx.dashboardHref,
    variant: 'solid',
    testId: 'cta-back-to-my-studies',
})

const editCode = (ctx: NavCtx, variant: NavVariant): NavAction => ({
    label: 'Edit code',
    href: Routes.studyResubmit({ orgSlug: ctx.orgSlug, studyId: ctx.studyId }),
    variant,
    testId: 'cta-edit-code',
})

// --- phase anchors -------------------------------------------------------------------------------
// "Previous step" is anchored per phase rather than to the page the user arrived from, which is what
// lets this table stay a pure function of state.

// Code phase anchors to Agreements, the step immediately before it. The spec's RL table anchors it
// to the approved proposal instead, which would strand the Agreements page; that is a change to the
// flow rather than to its navigation, so it is left for the card that owns it.
const codePreviousStep = (ctx: NavCtx): NavAction =>
    previousStep(
        Routes.studyResearcherAgreements({ orgSlug: ctx.orgSlug, studyId: ctx.studyId, returnTo: ctx.returnTo }),
    )

// Outputs phase anchors to the approved-code step, which the read-only /view/code route already serves.
const resultsPreviousStep = (ctx: NavCtx): NavAction =>
    previousStep(Routes.studyViewCode({ orgSlug: ctx.orgSlug, studyId: ctx.studyId, returnTo: ctx.returnTo }))

// --- per-screen rules ----------------------------------------------------------------------------

// The proposal screens are not converted here: their nav moves with the card that adds the read-only
// Step 1 page it depends on. Empty entries keep the table total without claiming those screens.
const notConvertedYet: NavRule = () => ({})

const codeUnderReviewNav: NavRule = (_state, ctx) => ({
    back: codePreviousStep(ctx),
    forward: backToMyStudies(ctx),
})

// Whether a forward step exists is "does /view resolve past this screen" — hasNextStepFromCode asks
// the rule table rather than restating its predicates, so screens the outputs epic adds gain a
// forward step here without this file changing (OTTER-687).
const codeApprovedNav: NavRule = (state, ctx) => {
    const back = codePreviousStep(ctx)
    if (!hasNextStepFromCode('researcher', state, 'code-approved')) return { back, forward: backToMyStudies(ctx) }
    return {
        back,
        forward: nextStep(Routes.studyView({ orgSlug: ctx.orgSlug, studyId: ctx.studyId, returnTo: ctx.returnTo })),
    }
}

const codeFeedbackNav: NavRule = (state, ctx) => {
    const back = codePreviousStep(ctx)
    if (state.codeDecision === 'CODE-CHANGES-REQUESTED') return { back, forward: editCode(ctx, 'solid') }
    // CODE-REJECTED is terminal negative: no further submissions accepted, so the exit is the action.
    return { back, forward: backToMyStudies(ctx) }
}

// --- outputs phase (researcher) -------------------------------------------------------------------
// All three anchor back to the approved-code step, like study-results. Their "View" action — entering
// a security key to decrypt — is a page action rather than a navigation, so it stays with the screen
// that owns the key, the same split Submit actions get.

// Running in the enclave: waiting on the run, so nothing is ahead.
const outputsPendingNav: NavRule = (_state, ctx) => ({
    back: resultsPreviousStep(ctx),
    forward: backToMyStudies(ctx),
})

// Feedback shared without outputs, and an errored run whose outputs were shared: in both the spec's
// forward action is the next iteration, so "Edit code" takes the solid slot.
const outputsFeedbackNav: NavRule = (_state, ctx) => ({
    back: resultsPreviousStep(ctx),
    forward: editCode(ctx, 'solid'),
})

// Terminal positive: the exit takes the solid slot and "Edit code" sits one level down as the optional
// further iteration (spec state 5). When the run returned feedback but no shareable outputs there is no
// successful flow to conclude, so Edit code is the primary action instead (spec states 5 vs 6).
const studyResultsNav: NavRule = (state, ctx) => {
    const back = resultsPreviousStep(ctx)
    if (!canResearcherResubmitCode(state)) return { back, forward: backToMyStudies(ctx) }
    if (state.resultsApproved) {
        return { back, secondary: editCode(ctx, 'outline'), forward: backToMyStudies(ctx) }
    }
    return { back, forward: editCode(ctx, 'solid') }
}

// Total by construction: a new researcher screen without nav is a compile error, matching the
// guarantee SCREEN_COMPONENTS gives the screen registry.
export const RESEARCHER_STEP_NAV: Record<ResearcherScreenId, NavRule> = {
    'study-overview': notConvertedYet,
    'proposal-feedback': notConvertedYet,
    'code-under-review': codeUnderReviewNav,
    'code-approved': codeApprovedNav,
    'code-feedback': codeFeedbackNav,
    'outputs-pending': outputsPendingNav,
    'outputs-feedback': outputsFeedbackNav,
    // Intentionally nav-identical to outputs-feedback: the two screens split only on banner copy, and
    // the spec gives both the same forward action. A state-dependent branch would need its own rule.
    'outputs-errored-shared': outputsFeedbackNav,
    'study-results': studyResultsNav,
}

export function resolveStepNav(screen: ResearcherScreenId, state: StudyState, ctx: NavCtx): StepNav {
    return RESEARCHER_STEP_NAV[screen](state, ctx)
}
