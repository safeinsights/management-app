'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { type UseFormReturnType } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useForm, useMutation, zodResolver } from '@/common'
import { reportMutationError } from '@/components/errors'
import { Routes } from '@/lib/routes'
import {
    initialResubmitNoteValue,
    resubmitNoteSchema,
    type ResubmitNoteValue,
} from '@/app/[orgSlug]/study/[studyId]/edit-and-resubmit/schema'
import { resubmitStudyCodeAction, saveCodeResubmissionNoteDraftAction } from '@/server/actions/study-request'

interface EditCodeResubmitContextValue {
    studyId: string
    noteForm: UseFormReturnType<ResubmitNoteValue>
    saveDraft: () => Promise<boolean>
    isSaving: boolean
    lastSavedAt: Date | null
    resubmit: (args: { mainFileName: string; fileNames: string[] }) => void
    isSubmitting: boolean
}

const EditCodeResubmitContext = createContext<EditCodeResubmitContextValue | null>(null)

export function useEditCodeResubmit(): EditCodeResubmitContextValue {
    const ctx = useContext(EditCodeResubmitContext)
    if (!ctx) throw new Error('useEditCodeResubmit must be used within EditCodeResubmitProvider')
    return ctx
}

const AUTOSAVE_DEBOUNCE_MS = 800

interface EditCodeResubmitProviderProps {
    children: ReactNode
    studyId: string
    initialNote: string
}

export function EditCodeResubmitProvider({ children, studyId, initialNote }: EditCodeResubmitProviderProps) {
    const router = useRouter()
    const { orgSlug } = useParams<{ orgSlug: string }>()

    const noteForm = useForm<ResubmitNoteValue>({
        validate: zodResolver(resubmitNoteSchema),
        initialValues: { ...initialResubmitNoteValue, resubmissionNote: initialNote },
        validateInputOnChange: true,
    })

    const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
    const lastSavedValueRef = useRef<string>(initialNote)
    const pendingValueRef = useRef<string>(initialNote)
    const savingValueRef = useRef<string | null>(null)
    const inFlightSaveRef = useRef<Promise<boolean> | null>(null)

    const saveMutation = useMutation({
        mutationFn: (note: string) => saveCodeResubmissionNoteDraftAction({ studyId, note }),
        onError: reportMutationError('Unable to save resubmission note draft'),
    })

    const flushSave = useCallback(
        async (value: string) => {
            if (value === lastSavedValueRef.current) return true

            if (savingValueRef.current === value && inFlightSaveRef.current) return inFlightSaveRef.current

            if (inFlightSaveRef.current) {
                await inFlightSaveRef.current
                if (value === lastSavedValueRef.current) return true
            }

            savingValueRef.current = value
            const savePromise = saveMutation
                .mutateAsync(value)
                .then(() => {
                    lastSavedValueRef.current = value
                    setLastSavedAt(new Date())
                    return true
                })
                .catch(() => false)
                .finally(() => {
                    if (savingValueRef.current === value) {
                        savingValueRef.current = null
                        inFlightSaveRef.current = null
                    }
                })
            inFlightSaveRef.current = savePromise

            try {
                return await savePromise
            } catch {
                return false
            }
        },
        [saveMutation],
    )

    const currentNote = noteForm.values.resubmissionNote

    useEffect(() => {
        pendingValueRef.current = currentNote
        if (currentNote === lastSavedValueRef.current) return
        const handle = setTimeout(() => {
            void flushSave(currentNote)
        }, AUTOSAVE_DEBOUNCE_MS)
        return () => clearTimeout(handle)
    }, [currentNote, flushSave])

    const saveDraft = useCallback(async () => {
        return flushSave(pendingValueRef.current)
    }, [flushSave])

    const submitMutation = useMutation({
        mutationFn: (args: { mainFileName: string; fileNames: string[] }) =>
            resubmitStudyCodeAction({
                studyId,
                mainFileName: args.mainFileName,
                fileNames: args.fileNames,
                resubmissionNote: pendingValueRef.current,
            }),
        onSuccess: () => {
            lastSavedValueRef.current = pendingValueRef.current
            notifications.show({
                title: 'Study Code Resubmitted',
                message: 'Your updated code has been submitted to the Data Partner.',
                color: 'green',
            })
            router.push(Routes.studyView({ orgSlug, studyId }))
        },
        onError: reportMutationError('Unable to resubmit study code'),
    })

    const resubmit = useCallback(
        (args: { mainFileName: string; fileNames: string[] }) => {
            const validation = noteForm.validate()
            if (validation.hasErrors) return
            submitMutation.mutate(args)
        },
        [noteForm, submitMutation],
    )

    const value = useMemo<EditCodeResubmitContextValue>(
        () => ({
            studyId,
            noteForm,
            saveDraft,
            isSaving: saveMutation.isPending,
            lastSavedAt,
            resubmit,
            isSubmitting: submitMutation.isPending,
        }),
        [studyId, noteForm, saveDraft, saveMutation.isPending, lastSavedAt, resubmit, submitMutation.isPending],
    )

    return <EditCodeResubmitContext.Provider value={value}>{children}</EditCodeResubmitContext.Provider>
}
