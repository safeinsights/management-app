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

    // Resolver is scoped to the fields Step 1 renders; `title` and `piName` belong to the
    // Step 2 editor and would otherwise fail validation with no field to show the error on.
    //
    // validateInputOnChange is retained on top of the blur default: this form is
    // uncontrolled, so a value change alone does not re-render the provider and
    // `isStep1Valid` below would go stale, leaving Proceed disabled after a valid
    // selection. Validating on change updates the errors state, which does re-render.
    const form = useForm<StudyProposalFormValues>({
        mode: 'uncontrolled',
        validate: zodResolver(step1FieldsSchema),
        initialValues: initialFormValues,
        validateInputOnChange: ['orgSlug', 'language'],
    })

    const { initDocumentFilesFromPaths, resetDocumentFiles, ...documentFiles } = useDocumentFiles()

    const isStep1Valid = form.isValid()

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
            // Seeds the Mantine form and the document-file store from the server-provided
            // draft. This is a genuine external-store sync from props, and initFromDraft's
            // form/store writes cannot run during render, so it must stay in an effect.
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
            isStep1Valid,

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
            isStep1Valid,
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
