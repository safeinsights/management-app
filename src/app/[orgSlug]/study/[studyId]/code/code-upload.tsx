'use client'

import type { Route } from 'next'
import { StudyCode } from '@/components/study/study-code'

interface CodeUploadPageProps {
    studyId: string
    previousHref: Route
}

export function CodeUploadPage({ studyId, previousHref }: CodeUploadPageProps) {
    return <StudyCode studyId={studyId} previousHref={previousHref} />
}
