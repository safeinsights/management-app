'use server'

import { redirect } from 'next/navigation'
import { AccessDeniedAlert, AlertNotFound } from '@/components/errors'
import { OpenStaxFeatureFlag } from '@/components/openstax-feature-flag'
import { isActionError, NotFoundError } from '@/lib/errors'
import { isFeatureFlagOrg } from '@/lib/org'
import { Routes } from '@/lib/routes'
import { getStudyAction } from '@/server/actions/study.actions'
import { sessionFromClerk } from '@/server/clerk'
import { latestJobForStudy, type LatestJobForStudy } from '@/server/db/queries'
import { CodeReviewView } from './code-review-view'
import { EnclaveReviewView } from './enclave-review-view'
import { LabReviewView } from './lab-review-view'
import { ProposalReviewView } from './proposal-review-view'

async function getLatestJob(studyId: string): Promise<LatestJobForStudy | null> {
    try {
        return await latestJobForStudy(studyId)
    } catch (error) {
        if (error instanceof NotFoundError) return null
        throw error
    }
}

export default async function StudyReviewPage(props: {
    params: Promise<{
        orgSlug: string
        studyId: string
    }>
}) {
    const params = await props.params
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

    // Feature-flagged orgs skip the review page for DRAFT studies — go straight to code upload
    if (study.status === 'DRAFT' && isFeatureFlagOrg(study.submittedByOrgSlug)) {
        redirect(Routes.studyCode({ orgSlug: study.submittedByOrgSlug, studyId }))
    }

    if (study.status === 'DRAFT') {
        return <LabReviewView orgSlug={study.submittedByOrgSlug} study={study} />
    }

    if (currentOrg.type === 'enclave') {
        let optInContent = <ProposalReviewView orgSlug={orgSlug} study={study} />
        if (isFeatureFlagOrg(orgSlug)) {
            const job = await getLatestJob(study.id)
            if (job) {
                optInContent = <CodeReviewView orgSlug={orgSlug} study={study} />
            }
        }
        return (
            <OpenStaxFeatureFlag
                defaultContent={<EnclaveReviewView orgSlug={orgSlug} study={study} />}
                optInContent={optInContent}
            />
        )
    }
}
