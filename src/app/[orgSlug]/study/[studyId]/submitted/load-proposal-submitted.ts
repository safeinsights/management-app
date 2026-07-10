import { captureException } from '@sentry/nextjs'
import {
    getProposalFeedbackForStudyAction,
    type ProposalFeedbackEntry,
    SelectedStudy,
} from '@/server/actions/study.actions'
import { getOrgNameFromId } from '@/server/db/queries'
import { deriveStudyVersion } from '@/lib/studies'
import { isActionError } from '@/lib/errors'
import type { Submitted } from '@/schema/study'

export type ProposalSubmittedData = {
    orgName: string
    entries: ProposalFeedbackEntry[]
    studyVersion: number
    feedbackError: boolean
}

// Shared loader for the ProposalSubmitted page (used by /submitted and the proposal-feedback /view
// screen so they render identically). On a feedback fetch error: report to Sentry, degrade to empty
// entries.
export async function loadProposalSubmittedData(study: Submitted<SelectedStudy>): Promise<ProposalSubmittedData> {
    const [orgName, feedbackResult] = await Promise.all([
        getOrgNameFromId(study.orgId),
        getProposalFeedbackForStudyAction({ studyId: study.id }),
    ])

    const feedbackError = isActionError(feedbackResult)
    if (feedbackError) {
        captureException(new Error(`Failed to fetch proposal feedback for study ${study.id}: ${feedbackResult.error}`))
    }

    const entries = feedbackError ? [] : feedbackResult
    return { orgName, entries, studyVersion: deriveStudyVersion(entries), feedbackError }
}
