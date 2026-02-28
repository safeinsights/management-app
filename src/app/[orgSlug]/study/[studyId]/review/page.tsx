'use server'

import { AccessDeniedAlert, AlertNotFound } from '@/components/errors'
import { OpenStaxFeatureFlag } from '@/components/openstax-feature-flag'
import { isActionError } from '@/lib/errors'
import { getStudyAction } from '@/server/actions/study.actions'
import { sessionFromClerk } from '@/server/clerk'
import { EnclaveReviewView } from './enclave-review-view'
import { LabReviewView } from './lab-review-view'
import { ProposalReviewView } from './proposal-review-view'

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

    if (currentOrg.type === 'lab') {
        return <LabReviewView orgSlug={study.submittedByOrgSlug} study={study} />
    }

    if (currentOrg.type === 'enclave') {
        const latestJobStatus = study.jobStatusChanges.at(0)?.status
        const codeSubmitted = latestJobStatus === 'CODE-SUBMITTED' || latestJobStatus === 'CODE-SCANNED'

        return (
            <OpenStaxFeatureFlag
                defaultContent={<EnclaveReviewView orgSlug={orgSlug} study={study} />}
                optInContent={
                    codeSubmitted
                        ? <EnclaveReviewView orgSlug={orgSlug} study={study} />
                        : <ProposalReviewView orgSlug={orgSlug} study={study} />
                }
            />
        )
    }
}
