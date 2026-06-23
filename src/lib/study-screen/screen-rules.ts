import type { StudyState } from './state.types'
import type { ScreenId } from './screens'

// Shared types for the role-specific screen-rule tables (RESEARCHER_SCREEN_RULES,
// REVIEWER_SCREEN_RULES). Each table is an ordered list of [screen, { when }] entries; order is
// display precedence and first match wins. The leaf view owns its own back/forward buttons.
export type ScreenRuleCtx = { orgSlug: string; studyId: string; returnTo?: 'org' }
export type ScreenRule = { when: (s: StudyState) => boolean }
export type ScreenRuleEntry = readonly [ScreenId, ScreenRule]
