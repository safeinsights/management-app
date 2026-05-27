import type { ProposalFeedbackEntry, SelectedStudy } from '@/server/actions/study.actions'
import type { Submitted } from '@/schema/study'
import { ProposalSubmitted } from './proposal-submitted'

interface SubmittedViewProps {
    orgSlug: string
    study: Submitted<SelectedStudy>
    orgName: string
    entries: ProposalFeedbackEntry[]
    studyVersion: number
    feedbackError?: boolean
}

export function SubmittedView({ orgSlug, study, orgName, entries, studyVersion, feedbackError }: SubmittedViewProps) {
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
