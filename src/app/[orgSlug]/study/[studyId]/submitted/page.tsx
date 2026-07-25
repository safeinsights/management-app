import { getStudyAction } from '@/server/actions/study.actions'
import { overlaidWithLatestProposalSnapshot } from '@/server/db/proposal-snapshot'
import { isActionError } from '@/lib/errors'
import { AlertNotFound } from '@/components/errors'
import { isSubmittedStudy } from '@/schema/study'
import { ProposalSubmitted } from './proposal-submitted'
import { loadProposalSubmittedData } from './load-proposal-submitted'

export default async function StudySubmittedRoute(props: {
    params: Promise<{ studyId: string; orgSlug: string }>
    searchParams: Promise<Record<string, string | undefined>>
}) {
    const { studyId, orgSlug } = await props.params
    const searchParams = await props.searchParams
    const returnTo = searchParams.returnTo === 'org' ? 'org' : undefined

    const result = await getStudyAction({ studyId })

    if (isActionError(result) || !result) {
        return <AlertNotFound title="Study was not found" message="No such study exists" />
    }

    // OTTER-636: render the last immutable submitted snapshot, not the mutable row (which may hold live
    // revision-draft edits). Overlay before the submitted-state narrowing so it still applies.
    const study = await overlaidWithLatestProposalSnapshot(studyId, result)

    if (!isSubmittedStudy(study)) {
        return <AlertNotFound title="Study was not found" message="This study has not been submitted yet" />
    }

    const { orgName, entries, studyVersion, feedbackError } = await loadProposalSubmittedData(study)

    return (
        <ProposalSubmitted
            orgSlug={orgSlug}
            study={study}
            orgName={orgName}
            entries={entries}
            studyVersion={studyVersion}
            feedbackError={feedbackError}
            returnTo={returnTo}
        />
    )
}
