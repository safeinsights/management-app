'use client'

import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { StudyCode } from '@/components/study/study-code'
import { CodeSubmissionPresence } from '@/components/study/code-submission-presence'
import { useCodeSubmissionPresence } from '@/hooks/use-code-submission-presence'
import type { StepNav } from '@/lib/study-screen'
import { Routes } from '@/lib/routes'

interface CodeUploadPageProps {
    orgSlug: string
    studyId: string
    dataPartnerName: string
    isFirstVisit: boolean
    videoDurationMinutes: number | null
    isEditable: boolean
    nav: StepNav
}

export function CodeUploadPage({
    orgSlug,
    studyId,
    dataPartnerName,
    isFirstVisit,
    videoDurationMinutes,
    isEditable,
    nav,
}: CodeUploadPageProps) {
    const router = useRouter()
    const presence = useCodeSubmissionPresence(studyId, isEditable)

    const onSubmitSuccess = useCallback(() => {
        presence.broadcastSubmitted()
        router.push(Routes.studyView({ orgSlug, studyId }))
    }, [presence, router, orgSlug, studyId])

    return (
        <StudyCode
            studyId={studyId}
            dataPartnerName={dataPartnerName}
            isFirstVisit={isFirstVisit}
            videoDurationMinutes={videoDurationMinutes}
            isEditable={isEditable}
            nav={nav}
            onSubmitSuccess={onSubmitSuccess}
            presence={<CodeSubmissionPresence {...presence} studyId={studyId} />}
        />
    )
}
