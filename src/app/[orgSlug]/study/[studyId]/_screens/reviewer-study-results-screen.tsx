import { StudyDetailsReviewer } from '../review/study-details-reviewer'
import type { ScreenComponentProps } from './types'

// Results-only Study Details (OTTER-538). StudyDetailsReviewer fetches its own job and renders
// AlertNotFound when there is none.
export function ReviewerStudyResultsScreen({ study, orgSlug }: ScreenComponentProps) {
    return <StudyDetailsReviewer orgSlug={orgSlug} study={study} />
}
