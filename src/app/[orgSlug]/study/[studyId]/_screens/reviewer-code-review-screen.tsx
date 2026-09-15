import { isSubmittedStudy } from '@/schema/study'
import { isActionError } from '@/lib/errors'
import { AlertNotFound } from '@/components/errors'
import { getCodeReviewFeedbackAction } from '@/server/actions/study.actions'
import { codeSubmissionVersion } from '@/server/db/queries'
import { CodeReview } from '../review/code-review'
import type { ScreenComponentProps } from './types'

// Entries errors become [] so the page still renders. reviewVersion comes from
// codeSubmissionVersion, not the entries action, so a fetch failure cannot
// silently drop a resubmission back to v1.
export async function ReviewerCodeReviewScreen({ study, orgSlug, nav }: ScreenComponentProps) {
    if (!isSubmittedStudy(study)) {
        return <AlertNotFound title="Study was not found" message="No such study exists" />
    }
    const [entries, reviewVersion] = await Promise.all([
        getCodeReviewFeedbackAction({ studyId: study.id }),
        codeSubmissionVersion(study.id),
    ])
    const safeEntries = isActionError(entries) ? [] : entries
    return <CodeReview orgSlug={orgSlug} study={study} entries={safeEntries} nav={nav} reviewVersion={reviewVersion} />
}
