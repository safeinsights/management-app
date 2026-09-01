import { isSubmittedStudy } from '@/schema/study'
import { isActionError } from '@/lib/errors'
import { AlertNotFound } from '@/components/errors'
import { getCodeReviewFeedbackAction } from '@/server/actions/study.actions'
import { CodeReview } from '../review/code-review'
import type { ScreenComponentProps } from './types'

// A fetch error is swallowed so this degrades to the first-submission view rather than a blocked
// page.
export async function ReviewerCodeReviewScreen({ study, orgSlug }: ScreenComponentProps) {
    if (!isSubmittedStudy(study)) {
        return <AlertNotFound title="Study was not found" message="No such study exists" />
    }
    const entries = await getCodeReviewFeedbackAction({ studyId: study.id })
    const safeEntries = isActionError(entries) ? [] : entries
    return <CodeReview orgSlug={orgSlug} study={study} entries={safeEntries} />
}
