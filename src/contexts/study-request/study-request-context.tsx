'use client'

import { createContext, useContext, useState, useCallback, useMemo, useEffect, type ReactNode } from 'react'
import { useForm, zodResolver } from '@/common'
import { step1FieldsSchema, type StudyProposalFormValues } from '@/app/[orgSlug]/study/request/form-schemas'
import {
    type StudyRequestContextValue,
    type DraftStudyData,
    type MutationOptions,
    initialFormValues,
} from './study-request-types'
import { useDocumentFiles } from './hooks/use-document-files'
import { useSaveDraft } from './hooks/use-save-draft'

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

    // Scoped to Step 1's fields; `piName` belongs to Step 2 and would fail with no field to show
    // the error on. `title` is in scope but stays out of validateInputOnChange, where its blank
    // rule would flash on every keystroke (OTTER-690).
    const form = useForm<StudyProposalFormValues>({
        mode: 'uncontrolled',
        validate: zodResolver(step1FieldsSchema),
        initialValues: initialFormValues,
        validateInputOnChange: ['orgSlug', 'language'],
    })

    const { initDocumentFilesFromPaths, resetDocumentFiles, ...documentFiles } = useDocumentFiles()

    const { saveDraft: saveDraftInternal, isSaving } = useSaveDraft({
        studyId,
        submittingOrgSlug,
        onStudyCreated: setStudyId,
    })

    const reset = useCallback(
        (preserveStudyId?: string) => {
            setStudyId(preserveStudyId ?? null)
            setOrgSlug('')
            resetDocumentFiles()
            form.reset()
        },
        [form, resetDocumentFiles],
    )

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
        },
        [form, initDocumentFilesFromPaths],
    )

    useEffect(() => {
        if (initialDraft) {
            // eslint-disable-next-line react-hooks/set-state-in-effect -- external store seeding from a server draft
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

            ...documentFiles,

            setStudyId,
            initFromDraft,
            reset,

            saveDraft,
            isSaving,
        }),
        // eslint-disable-next-line react-hooks/exhaustive-deps -- using individual stable properties instead of whole objects
        [
            studyId,
            orgSlug,
            submittingOrgSlug,
            form,
            documentFiles.documentFiles,
            documentFiles.existingFiles,
            documentFiles.setDocumentFile,
            documentFiles.setExistingDocuments,
            initFromDraft,
            reset,
            saveDraft,
            isSaving,
        ],
    )

    return <StudyRequestContext.Provider value={value}>{children}</StudyRequestContext.Provider>
}
