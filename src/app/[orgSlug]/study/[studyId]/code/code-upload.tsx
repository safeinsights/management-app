'use client'

import type { Route } from 'next'
import { StudyCode } from '@/components/study/study-code'

interface CodeUploadPageProps {
    studyId: string
    studyTitle: string
    previousHref: Route
}

export function CodeUploadPage({ studyId, studyTitle, previousHref }: CodeUploadPageProps) {
    return <StudyCode studyId={studyId} studyTitle={studyTitle} previousHref={previousHref} />
}
