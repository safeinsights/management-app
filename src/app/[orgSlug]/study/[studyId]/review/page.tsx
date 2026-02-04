'use server'

import { AccessDeniedAlert, AlertNotFound } from '@/components/errors'
import { isActionError } from '@/lib/errors'
import { getStudyAction } from '@/server/actions/study.actions'
import { sessionFromClerk } from '@/server/clerk'
import { EnclaveReviewView } from './enclave-review-view'
import { LabReviewView } from './lab-review-view'

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

    // Route based on study status and org type:
    // - DRAFT studies: LabReviewView (researcher reviewing before submission)
    // - Submitted studies (enclave org): EnclaveReviewView (enclave reviewing submitted code)
    if (study.status === 'DRAFT') {
        return <LabReviewView orgSlug={study.submittedByOrgSlug} study={study} />
    }

    if (currentOrg.type === 'enclave') {
        return <EnclaveReviewView orgSlug={orgSlug} study={study} />
    }
}
