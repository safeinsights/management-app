'use client'

import { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef, type ReactNode } from 'react'
import { useForm } from '@mantine/form'
import { zodResolver } from '@/common'
import {
    studyProposalFormSchema,
    step1ReadinessSchema,
    type StudyProposalFormValues,
} from '@/app/[orgSlug]/study/request/form-schemas'
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

    const { initDocumentFilesFromPaths, resetDocumentFiles, ...documentFiles } = useDocumentFiles()

    const step1Values = form.getValues()
    const isStep1Valid = step1ReadinessSchema.safeParse({
        orgSlug: step1Values.orgSlug,
        language: step1Values.language,
    }).success

    const { saveDraft: saveDraftInternal, isSaving } = useSaveDraft({
        studyId,
        submittingOrgSlug,
        onStudyCreated: setStudyId,
    })

    // OTTER-636 Phase 7: lazy-create the draft on the first persistable Step-1 edit (choosing a Data
    // Partner) instead of only on "Proceed to Step 2", so a brand-new proposal is never lost if the
    // researcher leaves Step 1 early. `studyIdRef` mirrors `studyId` synchronously (state lags a render)
    // so the watchers below can't spawn a second draft between create-success and the re-render.
    const studyIdRef = useRef(studyId)
    useEffect(() => {
        studyIdRef.current = studyId
    }, [studyId])
    const createInFlightRef = useRef(false)
    // Set when a Step-1 field changes while the create is still in flight. The create captured an earlier
    // snapshot of the form, so on success we run one follow-up save to persist whatever changed during
    // that window (otherwise a language pick made mid-create would be lost until Proceed).
    const pendingSaveRef = useRef(false)

    // Choosing a Data Partner is the first persistable edit. Fire the create once; the create captures
    // whatever else Step 1 already holds (e.g. a language picked first). Subsequent edits autosave below.
    // Wrapped in useCallback so the ref reads run in the deferred watch callback, never during render.
    const onOrgSlugChange = useCallback(
        ({ value }: { value: string }) => {
            if (!value || studyIdRef.current || createInFlightRef.current) return
            createInFlightRef.current = true
            saveDraftInternal(form.getValues(), {
                onSuccess: ({ studyId: newStudyId }) => {
                    studyIdRef.current = newStudyId
                    createInFlightRef.current = false
                    // Stamp the new id into the form so the Data-Partner selector locks (it is fixed at
                    // creation) without coupling that component to this context.
                    form.setFieldValue('createdStudyId', newStudyId)
                    // Flush any edit made while the create was in flight.
                    if (pendingSaveRef.current) {
                        pendingSaveRef.current = false
                        saveDraftInternal(form.getValues())
                    }
                },
                onError: () => {
                    createInFlightRef.current = false
                    pendingSaveRef.current = false
                },
            })
        },
        [saveDraftInternal, form],
    )
    // The watch callback fires on value change, never during render, so its ref reads are safe.
    // eslint-disable-next-line react-hooks/refs
    form.watch('orgSlug', onOrgSlugChange)

    // Autosave a later Step-1 field change once the draft exists. While the create is still in flight
    // (studyId not yet known) we can't save without spawning a duplicate draft, so record that a save is
    // owed and let the create's onSuccess flush it.
    const onLanguageChange = useCallback(() => {
        if (createInFlightRef.current) {
            pendingSaveRef.current = true
            return
        }
        if (!studyIdRef.current) return
        saveDraftInternal(form.getValues())
    }, [saveDraftInternal, form])
    // Deferred watch callback (see above); ref reads run on change, not during render.
    // eslint-disable-next-line react-hooks/refs
    form.watch('language', onLanguageChange)

    const reset = useCallback(
        (preserveStudyId?: string) => {
            // Keep the ref in lockstep with state so a fresh Data-Partner selection after reset triggers
            // exactly one create (state updates lag a render; the watcher reads the ref).
            studyIdRef.current = preserveStudyId ?? null
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
            // Set the ref before form.setValues fires the orgSlug watcher, so loading an existing draft
            // is never mistaken for a first-edit and re-created.
            studyIdRef.current = draft.id
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
