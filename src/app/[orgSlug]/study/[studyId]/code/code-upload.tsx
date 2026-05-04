'use client'

import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { StudyCode } from '@/components/study/study-code'
import { usePostCodeSubmissionFeatureFlag } from '@/components/openstax-feature-flag'
import { Routes } from '@/lib/routes'

interface CodeUploadPageProps {
    orgSlug: string
    studyId: string
    studyTitle: string
    previousHref: Route
}

export function CodeUploadPage({ orgSlug, studyId, studyTitle, previousHref }: CodeUploadPageProps) {
    const router = useRouter()
    const isOptedIn = usePostCodeSubmissionFeatureFlag()

    const onSubmitSuccess = useCallback(() => {
        router.push(Routes.studyView({ orgSlug, studyId }))
    }, [router, orgSlug, studyId])

    return (
        <StudyCode
            studyId={studyId}
            studyTitle={studyTitle}
            previousHref={previousHref}
            onSubmitSuccess={isOptedIn ? onSubmitSuccess : undefined}
        />
    )
}
