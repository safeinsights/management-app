'use client'

import { useResubmitCode } from '@/contexts/resubmit-code'
import { UploadOrLaunch, ReviewUploadedFiles } from './views'

export function ResubmitStudyCodeForm() {
    const { viewMode } = useResubmitCode()

    if (viewMode === 'review') {
        return <ReviewUploadedFiles />
    }

    return <UploadOrLaunch />
}
