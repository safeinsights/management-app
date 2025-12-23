'use client'

import { useEffect } from 'react'
import { Language } from '@/database/types'
import { SubmissionReview } from './submission-review'
import { useStudyRequest } from '@/contexts/study-request'

interface DraftSubmissionReviewProps {
    studyId: string
    orgSlug: string
    submittingOrgSlug: string
    title: string
    piName: string
    language: Language
    existingDocuments?: {
        description?: string | null
        irb?: string | null
        agreement?: string | null
    }
    existingCodeFiles?: {
        mainFileName?: string | null
        additionalFileNames?: string[]
    }
}

export function DraftSubmissionReview({
    studyId,
    orgSlug,
    submittingOrgSlug,
    title,
    piName,
    language,
    existingDocuments,
    existingCodeFiles,
}: DraftSubmissionReviewProps) {
    const { codeFiles, setStudyId, setExistingDocuments, initFromDraft } = useStudyRequest()

    useEffect(() => {
        setStudyId(studyId)

        if (existingDocuments) {
            setExistingDocuments({
                description: existingDocuments.description,
                irb: existingDocuments.irb,
                agreement: existingDocuments.agreement,
            })
        }

        if (existingCodeFiles && !codeFiles.mainFile) {
            initFromDraft(
                {
                    id: studyId,
                    orgSlug,
                    language,
                    mainCodeFileName: existingCodeFiles.mainFileName,
                    additionalCodeFileNames: existingCodeFiles.additionalFileNames,
                },
                submittingOrgSlug,
            )
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [studyId])

    return (
        <SubmissionReview
            studyId={studyId}
            orgSlug={orgSlug}
            submittingOrgSlug={submittingOrgSlug}
            title={title}
            piName={piName}
            language={language}
            existingDocuments={existingDocuments}
        />
    )
}
