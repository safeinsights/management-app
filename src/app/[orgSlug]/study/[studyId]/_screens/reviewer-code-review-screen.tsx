import { isSubmittedStudy } from '@/schema/study'
import { isActionError } from '@/lib/errors'
import { AlertNotFound } from '@/components/errors'
import { getCodeReviewFeedbackAction } from '@/server/actions/study.actions'
import { CodeReview } from '../review/code-review'
import type { ScreenComponentProps } from './types'

// A fetch error becomes [] so the page still renders; the round is derived from the job inside
// CodeReview, so a failure here cannot drop a resubmission back to v1.
export async function ReviewerCodeReviewScreen({ study, orgSlug, nav }: ScreenComponentProps) {
    if (!isSubmittedStudy(study)) {
        return <AlertNotFound title="Study was not found" message="No such study exists" />
    }
    const entries = await getCodeReviewFeedbackAction({ studyId: study.id })
    const safeEntries = isActionError(entries) ? [] : entries
    return <CodeReview orgSlug={orgSlug} study={study} entries={safeEntries} nav={nav} />
}
