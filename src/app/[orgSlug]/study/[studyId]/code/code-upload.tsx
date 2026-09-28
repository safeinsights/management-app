'use client'

import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { StudyCode } from '@/components/study/study-code'
import type { StepNav } from '@/lib/study-screen'
import { Routes } from '@/lib/routes'

interface CodeUploadPageProps {
    orgSlug: string
    studyId: string
    dataPartnerName: string
    isFirstVisit: boolean
    nav: StepNav
}

export function CodeUploadPage({ orgSlug, studyId, dataPartnerName, isFirstVisit, nav }: CodeUploadPageProps) {
    const router = useRouter()

    const onSubmitSuccess = useCallback(() => {
        router.push(Routes.studyView({ orgSlug, studyId }))
    }, [router, orgSlug, studyId])

    return (
        <StudyCode
            studyId={studyId}
            dataPartnerName={dataPartnerName}
            isFirstVisit={isFirstVisit}
            nav={nav}
            onSubmitSuccess={onSubmitSuccess}
        />
    )
}
