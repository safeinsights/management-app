'use server'

import { AccessDeniedAlert, AlertNotFound } from '@/components/errors'
import { isActionError } from '@/lib/errors'
import { Routes } from '@/lib/routes'
import { getStudyAction } from '@/server/actions/study.actions'
import { sessionFromClerk } from '@/server/clerk'
import { redirect } from 'next/navigation'
import { CodeReviewView } from './code-review-view'
import { ProposalReviewView } from './proposal-review-view'
import { StudyViewTracker } from '@/components/study/study-view-tracker'

export default async function StudyReviewPage(props: {
    params: Promise<{
        orgSlug: string
        studyId: string
    }>
    searchParams: Promise<{ from?: string }>
}) {
    const params = await props.params
    const searchParams = await props.searchParams
    const { orgSlug, studyId } = params

    const session = await sessionFromClerk()
    const currentOrg = session?.orgs[orgSlug]
    if (!session || !currentOrg) {
        return <AccessDeniedAlert />
    }

    const study = await getStudyAction({ studyId })
    if (isActionError(study) || !study) {
        return <AlertNotFound title="Study was not found" message="no such study exists" />
    }

    if (currentOrg.type === 'lab') {
        redirect(Routes.studyView({ orgSlug: study.submittedByOrgSlug, studyId }))
    }

    if (currentOrg.type === 'enclave') {
        const codeSubmitted = study.jobStatusChanges.some(
            (s) => s.status === 'CODE-SUBMITTED' || s.status === 'CODE-SCANNED',
        )
        // When a reviewer navigates back from the agreements step, show the proposal
        // instead of the code review — they've already reviewed code and need to revisit the proposal
        if (searchParams.from === 'agreements' && codeSubmitted) {
            return (
                <>
                    <StudyViewTracker studyId={studyId} />
                    <ProposalReviewView
                        orgSlug={orgSlug}
                        study={study}
                        agreementsHref={Routes.studyAgreements({ orgSlug, studyId })}
                    />
                </>
            )
        }

        if (codeSubmitted) {
            return (
                <>
                    <StudyViewTracker studyId={studyId} />
                    <CodeReviewView orgSlug={orgSlug} study={study} />
                </>
            )
        }
        return (
            <>
                <StudyViewTracker studyId={studyId} />
                <ProposalReviewView orgSlug={orgSlug} study={study} />
            </>
        )
    }

    return <AlertNotFound title="Study was not found" message="no such study exists" />
}
