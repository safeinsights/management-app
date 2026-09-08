'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { type UseFormReturnType } from '@mantine/form'
import { type HocuspocusProviderWebsocket } from '@hocuspocus/provider'
import { useForm, useMutation, zodResolver } from '@/common'
import { reportMutationError } from '@/components/errors'
import {
    proposalFormSchema,
    initialProposalValues,
    type ProposalFormValues,
} from '@/app/[orgSlug]/study/[studyId]/proposal/schema'
import { type useYjsFormMap } from '@/hooks/use-yjs-form-map'
import { useProposalCollaboration } from '@/hooks/use-proposal-collaboration'
import { useSingleUserEditing } from '@/lib/realtime/yjs-websocket-context'
import { useResubmitProposal } from './hooks/use-resubmit-proposal'
import {
    resubmitNoteSchema,
    resubmissionNoteToLexicalJson,
    type ResubmitNoteValue,
    initialResubmitNoteValue,
} from '@/app/[orgSlug]/study/[studyId]/edit-and-resubmit/schema'
import { saveProposalResubmissionNoteDraftAction } from '@/server/actions/study-request'

export type EditResubmitDraftData = Partial<ProposalFormValues>

interface EditResubmitContextValue {
    studyId: string
    form: UseFormReturnType<ProposalFormValues>
    noteForm: UseFormReturnType<ResubmitNoteValue>
    flushNote: () => Promise<boolean>
    resubmit: () => void
    isSubmitting: boolean
    isSavingNote: boolean
    noteLastSavedAt: Date | null
    websocketProvider: HocuspocusProviderWebsocket | null
    yjsForm: ReturnType<typeof useYjsFormMap>
    /** Stable per-mount tab id used to de-dupe the broadcaster's own kick-out broadcast. */
    tabSessionId: string
}

const EditResubmitContext = createContext<EditResubmitContextValue | null>(null)

export function useEditResubmit(): EditResubmitContextValue {
    const ctx = useContext(EditResubmitContext)
    if (!ctx) throw new Error('useEditResubmit must be used within EditResubmitProvider')
    return ctx
}

// Matches OTTER-558's debounce window.
const AUTOSAVE_DEBOUNCE_MS = 800

interface EditResubmitProviderProps {
    children: ReactNode
    studyId: string
    draftData?: EditResubmitDraftData
    initialNote?: string
}

export function EditResubmitProvider({ children, studyId, draftData, initialNote = '' }: EditResubmitProviderProps) {
    const form = useForm<ProposalFormValues>({
        validate: zodResolver(proposalFormSchema),
        initialValues: { ...initialProposalValues, ...draftData },
        validateInputOnChange: true,
    })

    // Legacy plain-text drafts are normalized up front so dirty-tracking and submit see one shape.
    const normalizedInitialNote = resubmissionNoteToLexicalJson(initialNote)

    const noteForm = useForm<ResubmitNoteValue>({
        validate: zodResolver(resubmitNoteSchema),
        initialValues: { ...initialResubmitNoteValue, resubmissionNote: normalizedInitialNote },
        validateInputOnChange: true,
    })

    const { websocketProvider, yjsForm, tabSessionId } = useProposalCollaboration({ studyId, form })

    // Refs track a single in-flight save so a flurry of keystrokes collapses into one call
    // (OTTER-521, OTTER-558).
    const [noteLastSavedAt, setNoteLastSavedAt] = useState<Date | null>(null)
    const lastSavedNoteRef = useRef<string>(normalizedInitialNote)
    const pendingNoteRef = useRef<string>(normalizedInitialNote)
    const savingNoteRef = useRef<string | null>(null)
    const inFlightNoteSaveRef = useRef<Promise<boolean> | null>(null)

    // A Server Action posts to whatever route is current, so an autosave in flight across a
    // navigation rejects; reporting it would toast on a page the researcher already left.
    const isMountedRef = useRef(true)
    useEffect(() => {
        isMountedRef.current = true
        return () => {
            isMountedRef.current = false
        }
    }, [])

    const reportNoteSaveError = reportMutationError('Unable to save resubmission note draft')
    const noteSaveMutation = useMutation({
        mutationFn: (note: string) => saveProposalResubmissionNoteDraftAction({ studyId, note }),
        onError: (error: unknown) => {
            if (!isMountedRef.current) return
            reportNoteSaveError(error)
        },
    })

    const flushNoteSave = useCallback(
        async (value: string): Promise<boolean> => {
            if (value === lastSavedNoteRef.current) return true

            if (savingNoteRef.current === value && inFlightNoteSaveRef.current) return inFlightNoteSaveRef.current

            if (inFlightNoteSaveRef.current) {
                await inFlightNoteSaveRef.current
                if (value === lastSavedNoteRef.current) return true
            }

            savingNoteRef.current = value
            const savePromise = noteSaveMutation
                .mutateAsync(value)
                .then(() => {
                    lastSavedNoteRef.current = value
                    setNoteLastSavedAt(new Date())
                    return true
                })
                .catch(() => false)
                .finally(() => {
                    if (savingNoteRef.current === value) {
                        savingNoteRef.current = null
                        inFlightNoteSaveRef.current = null
                    }
                })
            inFlightNoteSaveRef.current = savePromise

            return savePromise
        },
        [noteSaveMutation],
    )

    const currentNote = noteForm.values.resubmissionNote
    const singleUserEditing = useSingleUserEditing()

    // In collaborative mode the Yjs doc is the live persistence; in single-user mode this debounce
    // is the only persistence.
    useEffect(() => {
        pendingNoteRef.current = currentNote
        if (!singleUserEditing) return
        if (currentNote === lastSavedNoteRef.current) return
        const handle = setTimeout(() => {
            void flushNoteSave(currentNote)
        }, AUTOSAVE_DEBOUNCE_MS)
        return () => clearTimeout(handle)
    }, [currentNote, singleUserEditing, flushNoteSave])

    // Without this a note typed inside the last debounce window is lost on navigation. Returns
    // false on failure so Back can block.
    const flushNote = useCallback(() => flushNoteSave(pendingNoteRef.current), [flushNoteSave])

    const { resubmit, isSubmitting } = useResubmitProposal({ studyId, form, noteForm, yjsForm, tabSessionId })

    const value = useMemo(
        () => ({
            studyId,
            form,
            noteForm,
            flushNote,
            resubmit,
            isSubmitting,
            isSavingNote: noteSaveMutation.isPending,
            noteLastSavedAt,
            websocketProvider,
            yjsForm,
            tabSessionId,
        }),
        [
            studyId,
            form,
            noteForm,
            flushNote,
            resubmit,
            isSubmitting,
            noteSaveMutation.isPending,
            noteLastSavedAt,
            websocketProvider,
            yjsForm,
            tabSessionId,
        ],
    )

    return <EditResubmitContext.Provider value={value}>{children}</EditResubmitContext.Provider>
}
