import type { PillId } from '@/lib/status-labels'
import type { StudyState } from './state.types'

// Each table is an ordered list of [pill, { when }] entries; order is display precedence and first
// match wins, the same contract the screen rule tables use. A rule sees only StudyState.
//
// Pills and screens answer different questions and cannot share a table: two researchers on
// `outputs-shared` and `outputs-errored-shared` see different screens but can carry the same pill,
// and the outputs pill splits on whether the researcher has opened the decision, which no screen
// cares about.
export type PillRule = { when: (s: StudyState) => boolean }
export type PillRuleEntry = readonly [PillId, PillRule]
