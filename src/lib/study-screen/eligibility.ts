import type { StudyState } from './state.types'

// "Any resubmittable fact present" equals "the latest decision is resubmittable" because FILES-*
// are round-closing and CODE-REJECTED is terminal.
export const canResearcherResubmitCode = (s: StudyState): boolean =>
    s.codeDecision === 'CODE-CHANGES-REQUESTED' || s.resultsApproved || s.resultsRejected
