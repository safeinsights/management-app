import type { ScreenRuleCtx } from './screen-rules'
import type { ScreenId } from './screens'
import type { StudyRole, StudyState } from './state.types'
import { resolveScreen } from './resolve'

/**
 * Whether the code step has a forward step to offer (OTTER-687).
 *
 * The outputs screens are not routes of their own: each role reaches them at its canonical study URL
 * (`/view` for the researcher, `/review` for the reviewer) and the rule table decides what that URL
 * renders. So "is there a next step" is exactly "does that URL resolve to a screen other than the
 * code screen we are on" — a self-link is the only failure mode worth guarding, and it is precisely
 * the case where the answer is no.
 *
 * Asking the table instead of restating its predicates is what keeps this from drifting: a study
 * whose results have landed, or (once OTTER-686 registers the researcher's code-processing screen)
 * one still running in the enclave, starts offering a forward step here without this file changing.
 * It also subsumes the guards this replaces — a bare JOB-ERRORED still resolves back to the code
 * screen for the researcher, so the button stays hidden while the reviewer triages the error.
 */
export function hasNextStepFromCode(
    role: StudyRole,
    state: StudyState,
    currentScreen: ScreenId,
    ctx: ScreenRuleCtx,
): boolean {
    return resolveScreen(role, state, ctx).screen !== currentScreen
}
