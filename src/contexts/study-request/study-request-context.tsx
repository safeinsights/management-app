'use client'

import { createContext, useContext, useState, useCallback, useMemo, useEffect, type ReactNode } from 'react'
import { useForm } from '@mantine/form'
import { zodResolver } from '@/common'
import {
    studyProposalFormSchema,
    formReadinessSchema,
    type StudyProposalFormValues,
} from '@/app/[orgSlug]/study/request/step1-schema'
import {
    type StudyRequestContextValue,
    type DraftStudyData,
    type MutationOptions,
    initialFormValues,
} from './study-request-types'
import { useCodeFiles } from '@/contexts/shared'
import { useDocumentFiles } from './hooks/use-document-files'
import { useSaveDraft } from './hooks/use-save-draft'
import { useSubmitStudy } from './hooks/use-submit-study'

const StudyRequestContext = createContext<StudyRequestContextValue | null>(null)

export function useStudyRequest(): StudyRequestContextValue {
    const context = useContext(StudyRequestContext)
    if (!context) {
        throw new Error('useStudyRequest must be used within StudyRequestProvider')
    }
    return context
}

interface StudyRequestProviderProps {
    children: ReactNode
    initialStudyId?: string
    initialDraft?: DraftStudyData | null
    submittingOrgSlug: string
}

export function StudyRequestProvider({
    children,
    initialStudyId,
    initialDraft,
    submittingOrgSlug: initialSubmittingOrgSlug,
}: StudyRequestProviderProps) {
    const [studyId, setStudyId] = useState<string | null>(initialStudyId ?? null)
    const [orgSlug, setOrgSlug] = useState(initialDraft?.orgSlug ?? '')
    const [submittingOrgSlug, setSubmittingOrgSlug] = useState(initialSubmittingOrgSlug)
    const [codeUploadViewMode, setCodeUploadViewMode] = useState<'upload' | 'review'>('upload')

    const form = useForm<StudyProposalFormValues>({
        mode: 'uncontrolled',
        validate: zodResolver(studyProposalFormSchema),
        initialValues: initialFormValues,
        validateInputOnChange: [
            'title',
            'orgSlug',
            'language',
            'piName',
            'descriptionDocument',
            'irbDocument',
            'agreementDocument',
        ],
    })

    const codeFilesHook = useCodeFiles()
    const { initDocumentFilesFromPaths, resetDocumentFiles, ...documentFiles } = useDocumentFiles()

    const codeSource = codeFilesHook.source ?? 'upload'
    const setCodeFiles = codeFilesHook.setUploadedFiles
    const setIDECodeFiles = codeFilesHook.setIDEFiles
    const clearCodeFiles = codeFilesHook.clear

    const isFormValid = useMemo(() => {
        const formValues = form.getValues()

        const result = formReadinessSchema.safeParse({
            orgSlug: formValues.orgSlug,
            language: formValues.language,
            title: formValues.title,
            hasDescriptionDocument:
                !!formValues.descriptionDocument || !!documentFiles.existingFiles?.descriptionDocPath,
            hasIrbDocument: !!formValues.irbDocument || !!documentFiles.existingFiles?.irbDocPath,
            hasAgreementDocument: !!formValues.agreementDocument || !!documentFiles.existingFiles?.agreementDocPath,
        })

        return result.success
    }, [form, documentFiles.existingFiles])

    const { saveDraft: saveDraftInternal, isSaving } = useSaveDraft({
        studyId,
        submittingOrgSlug,
        onStudyCreated: setStudyId,
    })

    const reset = useCallback(
        (preserveStudyId?: string) => {
            setStudyId(preserveStudyId ?? null)
            setOrgSlug('')
            clearCodeFiles()
            setCodeUploadViewMode('upload')
            resetDocumentFiles()
            form.reset()
        },
        [form, clearCodeFiles, resetDocumentFiles],
    )

    const { submitStudy, isSubmitting } = useSubmitStudy({
        studyId,
        mainFileName: codeFilesHook.mainFileName,
        additionalFileNames: codeFilesHook.additionalFileNames,
        codeSource,
        codeFiles: codeFilesHook.codeFiles,
        onSuccess: reset,
    })

    const saveDraft = useCallback(
        (options?: MutationOptions) => {
            saveDraftInternal(form.getValues(), options)
        },
        [saveDraftInternal, form],
    )

    const initFromDraft = useCallback(
        (draft: DraftStudyData, newSubmittingOrgSlug: string) => {
            setStudyId(draft.id)
            setOrgSlug(draft.orgSlug)
            setSubmittingOrgSlug(newSubmittingOrgSlug)

            form.setValues({
                ...initialFormValues,
                title: draft.title || '',
                piName: draft.piName || '',
                language: draft.language || null,
                orgSlug: draft.orgSlug || '',
            })
            form.resetDirty()

            initDocumentFilesFromPaths({
                descriptionDocPath: draft.descriptionDocPath,
                irbDocPath: draft.irbDocPath,
                agreementDocPath: draft.agreementDocPath,
            })

            if (draft.mainCodeFileName) {
                codeFilesHook.setIDEFiles(draft.mainCodeFileName, [
                    draft.mainCodeFileName,
                    ...(draft.additionalCodeFileNames || []),
                ])
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps -- using stable setIDEFiles reference to avoid infinite loops
        [form, initDocumentFilesFromPaths, codeFilesHook.setIDEFiles],
    )

    useEffect(() => {
        if (initialDraft) {
            initFromDraft(initialDraft, initialSubmittingOrgSlug)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialDraft?.id])

    const value: StudyRequestContextValue = useMemo(
        () => ({
            studyId,
            orgSlug,
            submittingOrgSlug,
            form,
            isFormValid,

            codeFiles: codeFilesHook.codeFiles,
            codeFilesLastUpdated: codeFilesHook.lastUpdated,
            mainFileName: codeFilesHook.mainFileName,
            additionalFileNames: codeFilesHook.additionalFileNames,
            canProceedToReview: codeFilesHook.canProceed,
            canSubmit: codeFilesHook.canProceed,
            setMainCodeFile: codeFilesHook.setMainFile,
            removeCodeFile: codeFilesHook.removeFile,

            codeSource,
            codeUploadViewMode,
            setCodeFiles,
            setIDECodeFiles,
            clearCodeFiles,
            setCodeUploadViewMode,

            ...documentFiles,

            setStudyId,
            initFromDraft,
            reset,

            saveDraft,
            isSaving,

            submitStudy,
            isSubmitting,
        }),
        // eslint-disable-next-line react-hooks/exhaustive-deps -- using individual stable properties instead of whole objects
        [
            studyId,
            orgSlug,
            submittingOrgSlug,
            form,
            isFormValid,
            codeFilesHook.codeFiles,
            codeFilesHook.lastUpdated,
            codeFilesHook.mainFileName,
            codeFilesHook.additionalFileNames,
            codeFilesHook.canProceed,
            codeFilesHook.setMainFile,
            codeFilesHook.removeFile,
            codeSource,
            codeUploadViewMode,
            setCodeFiles,
            setIDECodeFiles,
            clearCodeFiles,
            documentFiles.documentFiles,
            documentFiles.existingFiles,
            documentFiles.setDocumentFile,
            documentFiles.setExistingDocuments,
            initFromDraft,
            reset,
            saveDraft,
            isSaving,
            submitStudy,
            isSubmitting,
        ],
    )

    return <StudyRequestContext.Provider value={value}>{children}</StudyRequestContext.Provider>
}
