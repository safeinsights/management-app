import { isSubmittedStudy } from '@/schema/study'
import { isActionError } from '@/lib/errors'
import { AlertNotFound } from '@/components/errors'
import { getCodeReviewFeedbackAction } from '@/server/actions/study.actions'
import { CodeReview } from '../review/code-review'
import type { ScreenComponentProps } from './types'

// Active code review. CodeReview fetches its own job + scan; it needs only prior code-review entries
// (present only when a prior round exists → triggers the resubmission variant). Swallow a fetch
// error so it degrades to the first-submission view, not a blocked page.
export async function ReviewerCodeReviewScreen({ study, orgSlug }: ScreenComponentProps) {
    if (!isSubmittedStudy(study)) {
        return <AlertNotFound title="Study was not found" message="No such study exists" />
    }
    const entries = await getCodeReviewFeedbackAction({ studyId: study.id })
    const safeEntries = isActionError(entries) ? [] : entries
    return <CodeReview orgSlug={orgSlug} study={study} entries={safeEntries} />
}
