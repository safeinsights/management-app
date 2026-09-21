import type { PillId } from '@/lib/status-labels'
import type { RuleEntry } from './screen-rules'

// Pills and screens share the rule shape but not a table: two researchers on `outputs-shared` and
// `outputs-errored-shared` see different screens but can carry the same pill, and the outputs pill
// splits on whether the researcher has opened the decision, which no screen cares about.
export type PillRuleEntry = RuleEntry<PillId>
