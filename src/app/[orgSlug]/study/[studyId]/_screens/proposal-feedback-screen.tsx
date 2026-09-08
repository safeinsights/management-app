import { notFound } from 'next/navigation'
import { isSubmittedStudy } from '@/schema/study'
import { ProposalSubmitted } from '../submitted/proposal-submitted'
import { loadProposalSubmittedData } from '../submitted/load-proposal-submitted'
import type { ScreenComponentProps } from './types'

// Renders the same ProposalSubmitted page as /submitted so the two stay identical.
export async function ProposalFeedbackScreen({ study, orgSlug }: ScreenComponentProps) {
    if (!isSubmittedStudy(study)) notFound()

    const { orgName, entries, studyVersion, feedbackError } = await loadProposalSubmittedData(study)

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
