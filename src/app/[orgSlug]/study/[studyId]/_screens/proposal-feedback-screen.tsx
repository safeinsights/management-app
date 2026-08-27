import { notFound } from 'next/navigation'
import type { Route } from 'next'
import { isSubmittedStudy } from '@/schema/study'
import { projectStudyState, resolveStepNav } from '@/lib/study-screen'
import { ProposalSubmitted } from '../submitted/proposal-submitted'
import { loadProposalSubmittedData } from '../submitted/load-proposal-submitted'
import type { ScreenComponentProps } from './types'

// proposal-feedback: renders the same ProposalSubmitted page as /submitted (read-only initial request
// + step nav), so the two stay identical.
export async function ProposalFeedbackScreen({ study, raw, orgSlug, dashboardHref, returnTo }: ScreenComponentProps) {
    if (!isSubmittedStudy(study)) notFound()

    const { orgName, entries, studyVersion, feedbackError } = await loadProposalSubmittedData(study)
    const nav = resolveStepNav('proposal-feedback', projectStudyState(raw), {
        orgSlug,
        studyId: study.id,
        dashboardHref: dashboardHref as Route,
        returnTo,
    })

    return (
        <ProposalSubmitted
            orgSlug={orgSlug}
            study={study}
            orgName={orgName}
            entries={entries}
            studyVersion={studyVersion}
            feedbackError={feedbackError}
            nav={nav}
        />
    )
}
