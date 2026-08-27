import type { Route } from 'next'
import { getStudyAction } from '@/server/actions/study.actions'
import { isActionError } from '@/lib/errors'
import { AlertNotFound } from '@/components/errors'
import { isSubmittedStudy } from '@/schema/study'
import { Routes } from '@/lib/routes'
import { rawStudyStateForStudy } from '@/server/db/study-state-query'
import { projectStudyState, proposalStatusScreen, resolveStepNav } from '@/lib/study-screen'
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

    const rawStudyState = await rawStudyStateForStudy(studyId)
    if (!rawStudyState) {
        return <AlertNotFound title="Study was not found" message="No such study exists" />
    }

    const { orgName, entries, studyVersion, feedbackError } = await loadProposalSubmittedData(result)

    const state = projectStudyState(rawStudyState)
    const nav = resolveStepNav(proposalStatusScreen(state), state, {
        orgSlug,
        studyId,
        dashboardHref: (returnTo ? Routes.orgDashboard({ orgSlug }) : Routes.dashboard) as Route,
        returnTo,
    })

    return (
        <ProposalSubmitted
            orgSlug={orgSlug}
            study={result}
            orgName={orgName}
            entries={entries}
            studyVersion={studyVersion}
            feedbackError={feedbackError}
            nav={nav}
        />
    )
}
