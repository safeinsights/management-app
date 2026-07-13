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
import { useResubmitSaveDraft } from './hooks/use-resubmit-save-draft'
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
    saveDraft: () => Promise<boolean>
    resubmit: () => void
    isSaving: boolean
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

// Matches OTTER-558's debounce window. Long enough that a steady typist isn't
// firing a save on every keystroke, short enough that a 1-second pause feels
// like "saved" to the user.
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

    // The note editor is Lexical (OTTER-658), so the form value is Lexical JSON.
    // Legacy drafts saved by the old plain textarea are normalized up front so
    // dirty-tracking and submit both operate in JSON space.
    const normalizedInitialNote = resubmissionNoteToLexicalJson(initialNote)

    const noteForm = useForm<ResubmitNoteValue>({
        validate: zodResolver(resubmitNoteSchema),
        initialValues: { ...initialResubmitNoteValue, resubmissionNote: normalizedInitialNote },
        validateInputOnChange: true,
    })

    const { websocketProvider, yjsForm, tabSessionId } = useProposalCollaboration({ studyId, form })

    const { saveDraft: saveProposalDraft, isSaving } = useResubmitSaveDraft({ studyId, form })

    // OTTER-521 follow-up: persist the resubmission note via the same debounced
    // autosave the code-resubmission flow uses (OTTER-558). Single in-flight
    // save tracked by refs so a flurry of keystrokes collapses into one network
    // call, and saveDraft() can flush the latest typed value synchronously.
    const [noteLastSavedAt, setNoteLastSavedAt] = useState<Date | null>(null)
    const lastSavedNoteRef = useRef<string>(normalizedInitialNote)
    const pendingNoteRef = useRef<string>(normalizedInitialNote)
    const savingNoteRef = useRef<string | null>(null)
    const inFlightNoteSaveRef = useRef<Promise<boolean> | null>(null)

    const noteSaveMutation = useMutation({
        mutationFn: (note: string) => saveProposalResubmissionNoteDraftAction({ studyId, note }),
        onError: reportMutationError('Unable to save resubmission note draft'),
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

    // In collaborative mode the Yjs document is the live persistence (the
    // editor service stores every debounced update), so the per-keystroke
    // draft-column autosave would only duplicate traffic — the column is
    // refreshed by the explicit Save-as-draft flush instead, keeping it a
    // valid cold-seed fallback. In single-user mode there is no Yjs, so the
    // debounced autosave remains the only persistence.
    useEffect(() => {
        pendingNoteRef.current = currentNote
        if (!singleUserEditing) return
        if (currentNote === lastSavedNoteRef.current) return
        const handle = setTimeout(() => {
            void flushNoteSave(currentNote)
        }, AUTOSAVE_DEBOUNCE_MS)
        return () => clearTimeout(handle)
    }, [currentNote, singleUserEditing, flushNoteSave])

    // Save-as-draft: flush the proposal fields AND the latest note in parallel.
    // Returning true only when both succeed lets the Back handler block
    // navigation on a failed save (existing contract).
    const saveDraft = useCallback(async () => {
        const [proposalOk, noteOk] = await Promise.all([saveProposalDraft(), flushNoteSave(pendingNoteRef.current)])
        return proposalOk && noteOk
    }, [saveProposalDraft, flushNoteSave])

    const { resubmit, isSubmitting } = useResubmitProposal({ studyId, form, noteForm, yjsForm, tabSessionId })

    const value = useMemo(
        () => ({
            studyId,
            form,
            noteForm,
            saveDraft,
            resubmit,
            isSaving,
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
            saveDraft,
            resubmit,
            isSaving,
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
