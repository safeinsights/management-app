'use client'

import { useResubmitCode } from '@/contexts/resubmit-code'
import { ResubmitCodeView } from './resubmit-code-view'

export function ResubmitStudyCodeForm() {
    const { studyId, submittingOrgSlug } = useResubmitCode()

    return <ResubmitCodeView studyId={studyId} submittingOrgSlug={submittingOrgSlug} />
}
