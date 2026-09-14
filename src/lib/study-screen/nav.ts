import type { Route } from 'next'
import { Routes } from '@/lib/routes'
import type { ResearcherScreenId, ReviewerScreenId, ScreenId } from './screens'
import type { StudyRole, StudyState } from './state.types'
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
// screen is ever a dead end. Two tables, one per role: RESEARCHER_STEP_NAV (Research Lab) and
// REVIEWER_STEP_NAV (Data Partner). Submit actions that open a confirmation modal are not navigation
// and stay with the form that owns them, so a rule may legitimately return only "Previous step".

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

const editProposal = (ctx: NavCtx): NavAction => ({
    label: 'Edit proposal',
    href: Routes.studyEditAndResubmit({ orgSlug: ctx.orgSlug, studyId: ctx.studyId }),
    variant: 'solid',
    testId: 'cta-edit-proposal',
})

// --- phase anchors -------------------------------------------------------------------------------
// "Previous step" is anchored per phase rather than to the page the user arrived from, which is what
// lets this table stay a pure function of state.

// Proposal phase anchors to Step 1, which serves a submitted study as a read-only record (OTTER-764).
// returnTo rides along so the round trip lands back on the same entry point, exit included.
const proposalPreviousStep = (ctx: NavCtx): NavAction =>
    previousStep(Routes.studyEdit({ orgSlug: ctx.orgSlug, studyId: ctx.studyId, returnTo: ctx.returnTo }))

// Code phase anchors to the approved proposal, matching the spec's RL table. This branch originally
// anchored it to Agreements, the step that used to sit between them; OTTER-727 has since hidden that
// page and stripped its last researcher-facing links, so anchoring there would make this the only
// route back into it.
const codePreviousStep = (ctx: NavCtx): NavAction =>
    previousStep(Routes.studySubmitted({ orgSlug: ctx.orgSlug, studyId: ctx.studyId, returnTo: ctx.returnTo }))

// Outputs phase anchors to the approved-code step, which the read-only /view/code route already serves.
const resultsPreviousStep = (ctx: NavCtx): NavAction =>
    previousStep(Routes.studyViewCode({ orgSlug: ctx.orgSlug, studyId: ctx.studyId, returnTo: ctx.returnTo }))

// --- per-screen rules ----------------------------------------------------------------------------

// PENDING-REVIEW is pattern 3: the Data Partner holds the next move. A DRAFT lands here too, but its
// forward action is the wizard's own footer, so the step nav stays empty.
const studyOverviewNav: NavRule = (state, ctx) =>
    state.isDraft ? {} : { back: proposalPreviousStep(ctx), forward: backToMyStudies(ctx) }

// Submitting code and code decisions rewrite study.status, so a submitted job is checked first: it
// means the proposal was approved and this page was reached by walking back, so forward returns to
// the read-only code step. Before code, forward is Step 3, the fix, or the exit, by proposal decision.
const proposalFeedbackNav: NavRule = (state, ctx) => {
    const back = proposalPreviousStep(ctx)
    if (state.hasSubmittedCode) {
        return {
            back,
            forward: nextStep(
                Routes.studyViewCode({ orgSlug: ctx.orgSlug, studyId: ctx.studyId, returnTo: ctx.returnTo }),
            ),
        }
    }
    if (state.status === 'CHANGE-REQUESTED') return { back, forward: editProposal(ctx) }
    if (state.status === 'REJECTED') return { back, forward: backToMyStudies(ctx) }
    if (state.status === 'APPROVED') {
        return { back, forward: nextStep(Routes.studyCode({ orgSlug: ctx.orgSlug, studyId: ctx.studyId })) }
    }
    return { back, forward: backToMyStudies(ctx) }
}

const codeUnderReviewNav: NavRule = (_state, ctx) => ({
    back: codePreviousStep(ctx),
    forward: backToMyStudies(ctx),
})

// Code approved is only ever reached by walking back from the outputs step, which the screen table
// serves from the moment of approval, so the forward step is unconditional (spec: "Code approved"
// always offers Next step, whether or not the run has started).
const codeApprovedNav: NavRule = (_state, ctx) => ({
    back: codePreviousStep(ctx),
    forward: nextStep(Routes.studyView({ orgSlug: ctx.orgSlug, studyId: ctx.studyId, returnTo: ctx.returnTo })),
})

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
    'study-overview': studyOverviewNav,
    'proposal-feedback': proposalFeedbackNav,
    'code-under-review': codeUnderReviewNav,
    'code-approved': codeApprovedNav,
    'code-feedback': codeFeedbackNav,
    'outputs-pending': outputsPendingNav,
    'outputs-feedback': outputsFeedbackNav,
    // Intentionally nav-identical to outputs-feedback: the two screens split only on banner copy, and
    // the spec gives both the same forward action. A state-dependent branch would need its own rule.
    'outputs-errored-shared': outputsFeedbackNav,
    // A clean run whose outputs were shared is the successful conclusion, so it takes study-results'
    // shape rather than the errored share's: resultsApproved holds by definition here (OTTER-688), so
    // the rule reduces to exit-solid with Edit code one level down.
    'outputs-shared': studyResultsNav,
    'study-results': studyResultsNav,
}

export function resolveStepNav(screen: ResearcherScreenId, state: StudyState, ctx: NavCtx): StepNav {
    return RESEARCHER_STEP_NAV[screen](state, ctx)
}

// The /submitted route IS the proposal-status page whatever the study has done since: it is the anchor
// every code-phase "Previous step" walks back to. Its nav therefore comes from the proposal phase
// directly, not from resolveScreen, which would forward-jump to a code screen for the same state.
export const proposalStatusScreen = (state: StudyState): ResearcherScreenId =>
    state.status === 'PENDING-REVIEW' && !state.hasSubmittedCode ? 'study-overview' : 'proposal-feedback'

export function resolveProposalStatusNav(state: StudyState, ctx: NavCtx): StepNav {
    return resolveStepNav(proposalStatusScreen(state), state, ctx)
}

// The security-key screens split on a phase the state table cannot see (whether the key has been
// entered in this session). While locked, the key form's View button is the forward action, so the
// step nav keeps only Previous; the full nav applies once decrypted (spec: "Outputs available, before
// decryption"). Derived here so the panels render what they are handed rather than deriving it.
export type PhasedStepNav = { locked: StepNav; unlocked: StepNav }

export const phasedStepNav = (nav: StepNav): PhasedStepNav => ({ locked: { back: nav.back }, unlocked: nav })

// --- Data Partner ---------------------------------------------------------------------------------
// The reviewer's forward action on the active review screens is "Submit decision", which opens a
// confirmation modal rather than navigating, so it stays with the form that owns the decision. This
// table supplies only the navigational buttons for those screens.

// Code-phase screens anchor back to the decided proposal, mirroring the researcher side.
const reviewerCodePreviousStep = (ctx: NavCtx): NavAction =>
    previousStep(Routes.studyReviewProposal({ orgSlug: ctx.orgSlug, studyId: ctx.studyId }))

// Outputs-phase screens anchor back to the approved-code step, which /review/code already serves.
const reviewerResultsPreviousStep = (ctx: NavCtx): NavAction =>
    previousStep(Routes.studyReviewCode({ orgSlug: ctx.orgSlug, studyId: ctx.studyId }))

// The spec gives the post-decision proposal screen no back button: the proposal step is where the
// reviewer already stands. Once code exists the screen is only reached by walking back from it, so
// forward returns there (spec: "Previous step, then Next step back").
const reviewerProposalFeedbackNav: NavRule = (state, ctx) => {
    if (state.hasSubmittedCode) {
        return { forward: nextStep(Routes.studyReviewCode({ orgSlug: ctx.orgSlug, studyId: ctx.studyId })) }
    }
    return { forward: backToMyStudies(ctx) }
}

const reviewerCodeReviewNav: NavRule = (_state, ctx) => ({ back: reviewerCodePreviousStep(ctx) })

// Approved code always offers "Next step": /review serves the outputs step from the moment of approval
// (reviewer-screen-rules), so the forward step is unconditional whether or not the run has started.
// Changes requested or rejected leave the next move with the researcher, or end the study.
const reviewerCodeFeedbackNav: NavRule = (state, ctx) => {
    const back = reviewerCodePreviousStep(ctx)
    if (state.codeDecision === 'CODE-APPROVED') {
        return { back, forward: nextStep(Routes.studyReview({ orgSlug: ctx.orgSlug, studyId: ctx.studyId })) }
    }
    return { back, forward: backToMyStudies(ctx) }
}

// Waiting on the run, or the round is closed: nothing is ahead, so the exit takes the solid slot.
const reviewerOutputsExitNav: NavRule = (_state, ctx) => ({
    back: reviewerResultsPreviousStep(ctx),
    forward: backToMyStudies(ctx),
})

// Decrypting ("View") and "Submit decision" both belong to the panel, so only Previous is navigation.
const reviewerOutputsDecisionNav: NavRule = (_state, ctx) => ({ back: reviewerResultsPreviousStep(ctx) })

// Total over the reviewer screens, same guarantee as the researcher table.
export const REVIEWER_STEP_NAV: Record<ReviewerScreenId, NavRule> = {
    // The proposal review form owns its only action; the spec lists no back button for it.
    'reviewer-proposal-review': () => ({}),
    'reviewer-proposal-feedback': reviewerProposalFeedbackNav,
    // Unreachable since OTTER-727 and carries its own footer.
    'reviewer-agreements': () => ({}),
    'reviewer-code-review': reviewerCodeReviewNav,
    'reviewer-code-feedback': reviewerCodeFeedbackNav,
    'reviewer-outputs-pending': reviewerOutputsExitNav,
    'reviewer-outputs-errored': reviewerOutputsDecisionNav,
    'reviewer-outputs-available': reviewerOutputsDecisionNav,
    'reviewer-outputs-decided': reviewerOutputsExitNav,
}

export function resolveReviewerStepNav(screen: ReviewerScreenId, state: StudyState, ctx: NavCtx): StepNav {
    return REVIEWER_STEP_NAV[screen](state, ctx)
}

const isReviewerScreen = (screen: ScreenId): screen is ReviewerScreenId => screen in REVIEWER_STEP_NAV
const isResearcherScreen = (screen: ScreenId): screen is ResearcherScreenId => screen in RESEARCHER_STEP_NAV

// The single entry point for the screen dispatcher: the role picks the table, the resolved screen picks
// the rule. A screen outside its role's table (the reviewer fallback to study-overview) has no nav.
export function resolveScreenNav(role: StudyRole, screen: ScreenId, state: StudyState, ctx: NavCtx): StepNav {
    if (role === 'reviewer') return isReviewerScreen(screen) ? resolveReviewerStepNav(screen, state, ctx) : {}
    return isResearcherScreen(screen) ? resolveStepNav(screen, state, ctx) : {}
}
