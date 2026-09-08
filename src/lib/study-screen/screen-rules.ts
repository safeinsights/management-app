import type { StudyState } from './state.types'
import type { ScreenId } from './screens'

// Each table is an ordered list of [screen, { when }] entries; order is display precedence and
// first match wins. A rule sees only StudyState, never routing context.
export type ScreenRule = { when: (s: StudyState) => boolean }
export type ScreenRuleEntry = readonly [ScreenId, ScreenRule]
