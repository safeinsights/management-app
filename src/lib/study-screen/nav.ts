import type { Route } from 'next'
import { Routes } from '@/lib/routes'
import type { ResearcherScreenId } from './screens'
import type { StudyState } from './state.types'
import { isErroredResultHiddenFromResearcher } from './state'
import { canResearcherResubmitCode } from './eligibility'

// In-content step navigation (OTTER-673). The spec ("Otter - Front-End Logic" § Navigation) reduces
// every step page to one of three button patterns, picked by a single question: can the user move
// forward from here?
//
//   1. forward exists  — task unfinished, finishing it is the way forward   [Previous] [Submit …]
//   2. forward open    — step done, the user is revisiting                  [Previous] [Next step]
//   3. forward blocked — waiting on the other party, or terminal            [Previous] [Back to my studies]
//
// Pattern 3 elevates the exit into the solid slot precisely BECAUSE there is no forward action, so no
// screen is ever a dead end. This is the researcher (Research Lab) half; the Data Partner half is its
// own card and lands beside this table as REVIEWER_STEP_NAV.

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
    testId: 'nav-previous-step',
})

const nextStep = (href: Route): NavAction => ({
    label: 'Next step',
    href,
    variant: 'solid',
    testId: 'nav-next-step',
})

// Always "My studies", never the user's entry point. Deliberate for beta: entry-point routing would
// need per-study tracking kept correct across every state, and the primary nav is due for rework right
// after beta (spec § "Back to my studies for beta: why the lighter lift").
const backToMyStudies = (ctx: NavCtx): NavAction => ({
    label: 'Back to my studies',
    href: ctx.dashboardHref,
    variant: 'solid',
    testId: 'nav-back-to-my-studies',
})

const editProposal = (ctx: NavCtx): NavAction => ({
    label: 'Edit proposal',
    href: Routes.studyEditAndResubmit({ orgSlug: ctx.orgSlug, studyId: ctx.studyId }),
    variant: 'solid',
    testId: 'nav-edit-proposal',
})

const editCode = (ctx: NavCtx, variant: NavVariant): NavAction => ({
    label: 'Edit code',
    href: Routes.studyResubmit({ orgSlug: ctx.orgSlug, studyId: ctx.studyId }),
    variant,
    testId: 'nav-edit-code',
})

// --- phase anchors -------------------------------------------------------------------------------
// "Previous step" is anchored per phase rather than to the page the user arrived from, which is what
// lets this table stay a pure function of state.

// Proposal phase anchors to a read-only Step 1 (Set up study, Figma 530-26405) that the app does not
// have: Routes.studyEdit is the only Step 1 and its page 404s outside DRAFT. Returning undefined hides
// the button rather than shipping a link to a 404 — swapping this one function is the whole change once
// the page exists.
// The page, and the proposal-phase nav that depends on it, are being tracked on their own card;
// this stub goes away with it.
const proposalPreviousStep = (_ctx: NavCtx): NavAction | undefined => undefined

// Code phase anchors to the approved proposal, NOT to Agreements: the spec's RL table has no
// Agreements rows and the doc marks that flow removed (Jul 2026).
const codePreviousStep = (ctx: NavCtx): NavAction =>
    previousStep(Routes.studySubmitted({ orgSlug: ctx.orgSlug, studyId: ctx.studyId, returnTo: ctx.returnTo }))

// Outputs phase anchors to the approved-code step, which the read-only /view/code route already serves.
const resultsPreviousStep = (ctx: NavCtx): NavAction =>
    previousStep(Routes.studyViewCode({ orgSlug: ctx.orgSlug, studyId: ctx.studyId, returnTo: ctx.returnTo }))

// --- per-screen rules ----------------------------------------------------------------------------

// PENDING-REVIEW is pattern 3: the Data Partner holds the next move. A DRAFT lands here too, but its
// forward action is the wizard's own "Save & continue" footer, so the step nav stays empty.
const studyOverviewNav: NavRule = (state, ctx) =>
    state.isDraft ? {} : { back: proposalPreviousStep(ctx), forward: backToMyStudies(ctx) }

const proposalFeedbackNav: NavRule = (state, ctx) => {
    const back = proposalPreviousStep(ctx)
    if (state.status === 'CHANGE-REQUESTED') return { back, forward: editProposal(ctx) }
    if (state.status === 'REJECTED') return { back, forward: backToMyStudies(ctx) }
    // APPROVED — forward is Step 4. Code already submitted means this screen was reached by walking
    // back, so forward returns to the read-only code step instead of the upload page.
    const forwardHref = state.hasSubmittedCode
        ? Routes.studyViewCode({ orgSlug: ctx.orgSlug, studyId: ctx.studyId, returnTo: ctx.returnTo })
        : Routes.studyCode({ orgSlug: ctx.orgSlug, studyId: ctx.studyId })
    return { back, forward: nextStep(forwardHref) }
}

const codeUnderReviewNav: NavRule = (_state, ctx) => ({
    back: codePreviousStep(ctx),
    forward: backToMyStudies(ctx),
})

// The spec's forward here is a "Code processing" page that is not built yet (its row is marked
// New Page). Until it lands, forward opens only once results exist; before that there is genuinely
// nothing ahead, which is pattern 3.
const codeApprovedNav: NavRule = (state, ctx) => {
    const back = codePreviousStep(ctx)
    const resultsReady = state.hasResults && !isErroredResultHiddenFromResearcher(state)
    if (!resultsReady) return { back, forward: backToMyStudies(ctx) }
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
    'study-overview': studyOverviewNav,
    'proposal-feedback': proposalFeedbackNav,
    'code-under-review': codeUnderReviewNav,
    'code-approved': codeApprovedNav,
    'code-feedback': codeFeedbackNav,
    'study-results': studyResultsNav,
}

export function resolveStepNav(screen: ResearcherScreenId, state: StudyState, ctx: NavCtx): StepNav {
    return RESEARCHER_STEP_NAV[screen](state, ctx)
}

// The /submitted route IS the proposal-status page whatever the study has done since — it is the anchor
// every code-phase "Previous step" walks back to. Its nav therefore comes from the proposal phase
// directly, not from resolveScreen, which would forward-jump to a code screen for the same state.
export const proposalStatusScreen = (state: StudyState): ResearcherScreenId =>
    state.status === 'PENDING-REVIEW' ? 'study-overview' : 'proposal-feedback'
