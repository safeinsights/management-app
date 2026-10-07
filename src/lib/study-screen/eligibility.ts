import { isOutputsDecided } from './state'
import type { StudyState } from './state.types'

// "Any resubmittable fact present" equals "the latest decision is resubmittable" because FILES-*
// are round-closing and CODE-REJECTED is terminal.
export const canResearcherResubmitCode = (s: StudyState): boolean =>
    s.codeDecision === 'CODE-CHANGES-REQUESTED' || isOutputsDecided(s)

// /code's Submit is one-shot per round, which is what its confirmation modal promises. Keyed on
// hasSubmittedCode rather than codeAwaitingDecision so a decided round stays closed too: once a
// round has been submitted the way on is /resubmit, which requires a resubmission note (OTTER-693).
export const canResearcherSubmitCodeForReview = (s: StudyState): boolean => !s.hasSubmittedCode

// The union of the two surfaces that write workspace files — /code before its one submission and
// /resubmit after a decision reopens the round — so the shared file actions gate on "some submit
// path could still consume this" rather than on either page's own rule.
export const canResearcherChangeCodeFiles = (s: StudyState): boolean =>
    canResearcherSubmitCodeForReview(s) || canResearcherResubmitCode(s)
