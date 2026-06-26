import { captureException } from '@sentry/nextjs'
import { notFound } from 'next/navigation'
import { getProposalFeedbackForStudyAction } from '@/server/actions/study.actions'
import { getOrgNameFromId } from '@/server/db/queries'
import { deriveStudyVersion } from '@/lib/studies'
import { isActionError } from '@/lib/errors'
import { isSubmittedStudy } from '@/schema/study'
import { ProposalSubmitted } from '../submitted/proposal-submitted'
import type { ScreenComponentProps } from './types'

// proposal-feedback: read-only initial request (REJECTED / APPROVED / CHANGE-REQUESTED). Renders the
// same ProposalSubmitted page served at /submitted — the "View full initial request" toggle, the
// feedback-and-notes section, and the status-driven nav (APPROVED → "Proceed to step 3" → agreements),
// so the read-only view can revisit this step and walk forward again.
export async function ProposalFeedbackScreen({ study, orgSlug }: ScreenComponentProps) {
    if (!isSubmittedStudy(study)) notFound()

    const [orgName, feedbackResult] = await Promise.all([
        getOrgNameFromId(study.orgId),
        getProposalFeedbackForStudyAction({ studyId: study.id }),
    ])

    const feedbackError = isActionError(feedbackResult)
    if (feedbackError) {
        captureException(new Error(`Failed to fetch proposal feedback for study ${study.id}: ${feedbackResult.error}`))
    }

    const entries = feedbackError ? [] : feedbackResult
    const studyVersion = deriveStudyVersion(entries)

    return (
        <ProposalSubmitted
            orgSlug={orgSlug}
            study={study}
            orgName={orgName}
            entries={entries}
            studyVersion={studyVersion}
            feedbackError={feedbackError}
        />
    )
}
