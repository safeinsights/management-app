'use server'

import { AccessDeniedAlert, AlertNotFound } from '@/components/errors'
import { isActionError } from '@/lib/errors'
import { Routes } from '@/lib/routes'
import { getStudyAction } from '@/server/actions/study.actions'
import { sessionFromClerk } from '@/server/clerk'
import { redirect } from 'next/navigation'
import { CodeReviewView } from './code-review-view'
import { ProposalReviewView } from './proposal-review-view'

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
        const codeSubmitted = study.jobStatusChanges.some((s) => s.status === 'CODE-SUBMITTED')

        // When a reviewer navigates back from the agreements step, show the proposal
        if (searchParams.from === 'agreements' && codeSubmitted) {
            return (
                <ProposalReviewView
                    orgSlug={orgSlug}
                    study={study}
                    agreementsHref={Routes.studyAgreements({ orgSlug, studyId })}
                />
            )
        }

        if (codeSubmitted) {
            // Gate through agreements if the reviewer hasn't acknowledged them yet
            if (!study.reviewerAgreementsAckedAt && searchParams.from !== 'agreements-proceed') {
                return redirect(Routes.studyAgreements({ orgSlug, studyId }))
            }
            return <CodeReviewView orgSlug={orgSlug} study={study} />
        }
        return <ProposalReviewView orgSlug={orgSlug} study={study} />
    }

    return <AlertNotFound title="Study was not found" message="no such study exists" />
}
