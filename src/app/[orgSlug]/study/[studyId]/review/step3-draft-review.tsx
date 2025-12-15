'use client'

import { useEffect } from 'react'
import { Language } from '@/database/types'
import { SubmissionReview } from './step3-submission-review'
import { useStudyRequestStore, useCodeFiles } from '@/stores/study-request.store'

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
    const store = useStudyRequestStore()
    const codeFiles = useCodeFiles()

    // Initialize store from server data on mount
    useEffect(() => {
        // Set basic info
        store.setStudyId(studyId)
        store.setOrgSlug(orgSlug)
        store.setSubmittingOrgSlug(submittingOrgSlug)
        store.setLanguage(language)

        // Set existing documents if we don't already have them in memory
        if (existingDocuments) {
            store.setExistingDocuments({
                description: existingDocuments.description,
                irb: existingDocuments.irb,
                agreement: existingDocuments.agreement,
            })
        }

        // Set existing code files only if we don't have files in memory
        // (user might have uploaded new files in code step that aren't saved yet)
        if (existingCodeFiles && !codeFiles.mainFile) {
            // Initialize with server file references
            store.initFromDraft(
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
