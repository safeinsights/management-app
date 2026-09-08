import type { ScreenId } from './screens'
import type { StudyRole, StudyState } from './state.types'
import { resolveScreen } from './resolve'

// Outputs screens are not routes of their own, so this asks the screen table rather than
// restating its predicates, which would drift as screens are registered (OTTER-687).
export function hasNextStepFromCode(role: StudyRole, state: StudyState, currentScreen: ScreenId): boolean {
    return resolveScreen(role, state).screen !== currentScreen
}
