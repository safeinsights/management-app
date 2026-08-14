import { getOutputsDecisionFeedbackAction } from '@/server/actions/study.actions'
import { loadFeedbackEntries } from './load-feedback-entries'

export const loadOutputsFeedback = (studyId: string) => loadFeedbackEntries(getOutputsDecisionFeedbackAction, studyId)
