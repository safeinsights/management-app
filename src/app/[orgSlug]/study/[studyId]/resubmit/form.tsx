'use client'

import { useResubmitCode } from '@/contexts/resubmit-code'
import { UploadOrLaunch, ReviewUploadedFiles, ImportIDEFiles } from './views'

export function ResubmitStudyCodeForm() {
    const { viewMode } = useResubmitCode()

    if (viewMode === 'review') {
        return <ReviewUploadedFiles />
    }

    if (viewMode === 'import-ide') {
        return <ImportIDEFiles />
    }

    return <UploadOrLaunch />
}
