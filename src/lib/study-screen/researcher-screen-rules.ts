import type { ScreenRuleEntry } from './screen-rules'
import type { ScreenId } from './screens'

// Researcher Tier-2 rules. Order = display precedence (see spec §6). First match wins. Each entry
// pairs the screen it routes to with the condition that selects it; the leaf view owns its own
// back/forward buttons.
export const RESEARCHER_SCREEN_RULES = [
    // Results have landed: results-only Study Details.
    ['study-results', { when: (s) => s.hasResults }],

    // Code approved (or actively running): the approved/executing code screen.
    ['code-approved', { when: (s) => s.codeDecision === 'CODE-APPROVED' || s.isExecuting }],
    // Code rejected or changes requested: read-only code feedback.
    [
        'code-feedback',
        { when: (s) => s.codeDecision === 'CODE-CHANGES-REQUESTED' || s.codeDecision === 'CODE-REJECTED' },
    ],

    // Code submitted, awaiting a reviewer decision.
    ['code-under-review', { when: (s) => s.codeAwaitingDecision }],

    // Proposal approved but no code submitted yet: read-only proposal feedback (next step is code).
    ['proposal-feedback', { when: (s) => s.status === 'APPROVED' && !s.hasSubmittedCode }],

    // Proposal under review: generic overview.
    ['study-overview', { when: (s) => s.status === 'PENDING-REVIEW' }],
    // Decided proposal (read-only): CHANGE-REQUESTED, REJECTED, or APPROVED that already has code
    // (the no-code APPROVED case is handled by the proposal-feedback rule above).
    [
        'proposal-feedback',
        { when: (s) => s.status === 'CHANGE-REQUESTED' || s.status === 'REJECTED' || s.status === 'APPROVED' },
    ],

    // Draft: generic overview (editing lives on /edit).
    ['study-overview', { when: (s) => s.isDraft }],

    // Exhaustive fallback.
    ['study-overview', { when: () => true }],
] as const satisfies ReadonlyArray<ScreenRuleEntry>

// Read-only wizard steps that live on /view. Agreements (Step 3) is its own route, so it is NOT a
// /view step. `step` lets a researcher walk BACKWARD through earlier read-only steps of an advanced
// study (OTTER-614): resolveScreen caps the rule table at the requested step's rank and takes the
// first matching rule at or below it. A step the study has not reached (its rule's `when` is false)
// simply yields the natural top-precedence screen, so forward over-reach is impossible.
export type WizardStep = 'proposal' | 'code' | 'results'

// Where each researcher screen sits in the read-only wizard. Reviewer screens never appear in this
// table, so they are intentionally absent (treated as rank 0 by the resolver).
const RESEARCHER_SCREEN_STEP_RANK: Partial<Record<ScreenId, number>> = {
    'study-overview': 0,
    'proposal-feedback': 1,
    'code-under-review': 2,
    'code-approved': 2,
    'code-feedback': 2,
    'study-results': 3,
}

const WIZARD_STEP_CAP: Record<WizardStep, number> = { proposal: 1, code: 2, results: 3 }

export const researcherScreenRank = (screen: ScreenId): number => RESEARCHER_SCREEN_STEP_RANK[screen] ?? 0

// The rank ceiling for a requested step, or undefined when `step` is absent or not a wizard step
// (an unknown value falls through to the default state-driven screen rather than erroring).
export const wizardStepCap = (step: string | undefined): number | undefined =>
    step && step in WIZARD_STEP_CAP ? WIZARD_STEP_CAP[step as WizardStep] : undefined
