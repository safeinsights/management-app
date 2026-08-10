import type { ScreenId } from './screens'
import type { StudyRole, StudyState } from './state.types'
import { resolveScreen } from './resolve'

/**
 * Whether the code step has a forward step to offer (OTTER-687).
 *
 * The outputs screens are not routes of their own: each role reaches them at its canonical study URL
 * (`/view` for the researcher, `/review` for the reviewer) and the rule table decides what that URL
 * renders. So "is there a next step" is exactly "does that URL resolve to a screen other than the
 * code screen we are on". A self-link is the only failure mode worth guarding, and it is precisely
 * the case where the answer is no.
 *
 * Asking the table instead of restating its predicates is what keeps this from drifting: as the
 * outputs epic registers screens, the states that gain a forward step gain it here without this file
 * changing. Both of the epic's outputs screens landed that way, with no edit here: a study whose
 * results are in forwards on the strength of the results rule, and one still running in the enclave
 * began forwarding for the researcher when OTTER-686 registered `outputs-pending`.
 *
 * The same delegation subsumes the OTTER-614 guard this replaces. While an error is still hidden
 * from the researcher the table holds them on a screen that does not disclose it, so whichever
 * screen the forward link points at is one they were already entitled to land on.
 */
export function hasNextStepFromCode(role: StudyRole, state: StudyState, currentScreen: ScreenId): boolean {
    return resolveScreen(role, state).screen !== currentScreen
}
