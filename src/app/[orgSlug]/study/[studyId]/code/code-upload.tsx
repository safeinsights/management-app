'use client'

import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { StudyCode } from '@/components/study/study-code'
import { Routes } from '@/lib/routes'

interface CodeUploadPageProps {
    orgSlug: string
    studyId: string
    dataPartnerName: string
    isFirstVisit: boolean
    previousHref: Route
}

export function CodeUploadPage({ orgSlug, studyId, dataPartnerName, isFirstVisit, previousHref }: CodeUploadPageProps) {
    const router = useRouter()

    const onSubmitSuccess = useCallback(() => {
        router.push(Routes.studyView({ orgSlug, studyId }))
    }, [router, orgSlug, studyId])

    return (
        <StudyCode
            studyId={studyId}
            dataPartnerName={dataPartnerName}
            isFirstVisit={isFirstVisit}
            previousHref={previousHref}
            onSubmitSuccess={onSubmitSuccess}
        />
    )
}
