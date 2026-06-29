import { getStudyAction } from '@/server/actions/study.actions'
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

    if (!isSubmittedStudy(result)) {
        return <AlertNotFound title="Study was not found" message="This study has not been submitted yet" />
    }

    const { orgName, entries, studyVersion, feedbackError } = await loadProposalSubmittedData(result)

    return (
        <ProposalSubmitted
            orgSlug={orgSlug}
            study={result}
            orgName={orgName}
            entries={entries}
            studyVersion={studyVersion}
            feedbackError={feedbackError}
            returnTo={returnTo}
        />
    )
}
