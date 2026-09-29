import type { StudyState } from './state.types'
import type { ScreenId } from './screens'

// Every rule table in this directory is an ordered list of [id, { when }] entries; order is display
// precedence and first match wins. A rule sees only StudyState, never routing context.
export type Rule = { when: (s: StudyState) => boolean }
export type RuleEntry<Id> = readonly [Id, Rule]

// Every table ends in an unconditional rule, so a match always exists.
export const firstMatch = <Id>(rules: ReadonlyArray<RuleEntry<Id>>, state: StudyState): Id =>
    rules.find(([, rule]) => rule.when(state))![0]

export type ScreenRule = Rule
export type ScreenRuleEntry = RuleEntry<ScreenId>
