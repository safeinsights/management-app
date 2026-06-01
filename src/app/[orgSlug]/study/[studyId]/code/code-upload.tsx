'use client'

import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { StudyCode } from '@/components/study/study-code'
import { Routes } from '@/lib/routes'

interface CodeUploadPageProps {
    orgSlug: string
    studyId: string
    studyTitle: string | null
    previousHref: Route
}

export function CodeUploadPage({ orgSlug, studyId, studyTitle, previousHref }: CodeUploadPageProps) {
    const router = useRouter()

    const onSubmitSuccess = useCallback(() => {
        router.push(Routes.studyView({ orgSlug, studyId }))
    }, [router, orgSlug, studyId])

    return (
        <StudyCode
            studyId={studyId}
            studyTitle={studyTitle}
            previousHref={previousHref}
            onSubmitSuccess={onSubmitSuccess}
        />
    )
}
