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
import { useMarkProposalEdited } from './hooks/use-mark-proposal-edited'
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
    /** OTTER-636: editable inputs call this on a genuine user edit to stamp the "Proposal draft" signal. */
    signalProposalEdited: () => void
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

    // The note form holds Lexical JSON; legacy plain-text drafts are normalized
    // up front so dirty-tracking and submit operate in one shape.
    const normalizedInitialNote = resubmissionNoteToLexicalJson(initialNote)

    const noteForm = useForm<ResubmitNoteValue>({
        validate: zodResolver(resubmitNoteSchema),
        initialValues: { ...initialResubmitNoteValue, resubmissionNote: normalizedInitialNote },
        validateInputOnChange: true,
    })

    const { websocketProvider, yjsForm, tabSessionId } = useProposalCollaboration({ studyId, form })

    // OTTER-521 follow-up: persist the resubmission note via the same debounced
    // autosave the code-resubmission flow uses (OTTER-558). Single in-flight
    // save tracked by refs so a flurry of keystrokes collapses into one network
    // call, and flushNote() can flush the latest typed value synchronously.
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

    // OTTER-636: stamp the display-only "Proposal draft" signal on the first real edit. Field inputs
    // (title/datasets/PI/rich-text) call signalProposalEdited directly from their user-driven change
    // handlers; the note is wired below. study.status stays CHANGE-REQUESTED throughout.
    const signalProposalEdited = useMarkProposalEdited(studyId)

    // The note change counts as a genuine edit only in single-user mode, where the editor's onChange is
    // driven by the user's own keystrokes. In collaborative mode the note persists through Yjs and
    // hydration can emit onChange, so the note editor's user-driven handler is the signal there.
    useEffect(() => {
        if (singleUserEditing && currentNote !== normalizedInitialNote) signalProposalEdited()
    }, [singleUserEditing, currentNote, normalizedInitialNote, signalProposalEdited])

    // In collaborative mode the Yjs doc is the live persistence, so skip the
    // per-keystroke column save (Save-as-draft still refreshes the column as
    // the cold-seed fallback). In single-user mode this debounce is the only
    // persistence.
    useEffect(() => {
        pendingNoteRef.current = currentNote
        if (!singleUserEditing) return
        if (currentNote === lastSavedNoteRef.current) return
        const handle = setTimeout(() => {
            void flushNoteSave(currentNote)
        }, AUTOSAVE_DEBOUNCE_MS)
        return () => clearTimeout(handle)
    }, [currentNote, singleUserEditing, flushNoteSave])

    // Proposal fields autosave through Yjs; only the debounced note needs an explicit
    // flush before navigating away, otherwise a note typed inside the last debounce
    // window would be lost. Returns false on failure so Back can block navigation.
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
            signalProposalEdited,
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
            signalProposalEdited,
        ],
    )

    return <EditResubmitContext.Provider value={value}>{children}</EditResubmitContext.Provider>
}
