import type { StudyState } from './state.types'
import type { ScreenId } from './screens'

// Shared types for the role-specific screen-rule tables (RESEARCHER_SCREEN_RULES,
// REVIEWER_SCREEN_RULES). Each table is an ordered list of [screen, { when }] entries; order is
// display precedence and first match wins. A rule sees only StudyState, never routing context: the
// leaf view owns its own back/forward buttons, so no table entry ever needs to build an href.
export type ScreenRule = { when: (s: StudyState) => boolean }
export type ScreenRuleEntry = readonly [ScreenId, ScreenRule]
