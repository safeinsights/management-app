'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { type UseFormReturnType } from '@mantine/form'
import { useForm, zodResolver } from '@/common'
import {
    proposalFormSchema,
    initialProposalValues,
    type ProposalFormValues,
} from '@/app/[orgSlug]/study/[studyId]/proposal/schema'
import { useResubmitSaveDraft } from './hooks/use-resubmit-save-draft'
import { useResubmitProposal } from './hooks/use-resubmit-proposal'
import {
    resubmitNoteSchema,
    type ResubmitNoteValue,
    initialResubmitNoteValue,
} from '@/app/[orgSlug]/study/[studyId]/edit-and-resubmit/schema'

// The proposal fields are auto-saved server-side. The resubmission note is
// kept in client state only and persisted as a studyProposalComment row when
// resubmitProposalAction runs.
export type EditResubmitDraftData = Partial<ProposalFormValues>

interface EditResubmitContextValue {
    studyId: string
    form: UseFormReturnType<ProposalFormValues>
    noteForm: UseFormReturnType<ResubmitNoteValue>
    saveDraft: () => Promise<boolean>
    resubmit: () => void
    isSaving: boolean
    isSubmitting: boolean
    lastSavedAt: Date | null
}

const EditResubmitContext = createContext<EditResubmitContextValue | null>(null)

export function useEditResubmit(): EditResubmitContextValue {
    const ctx = useContext(EditResubmitContext)
    if (!ctx) throw new Error('useEditResubmit must be used within EditResubmitProvider')
    return ctx
}

interface EditResubmitProviderProps {
    children: ReactNode
    studyId: string
    draftData?: EditResubmitDraftData
}

export function EditResubmitProvider({ children, studyId, draftData }: EditResubmitProviderProps) {
    const form = useForm<ProposalFormValues>({
        validate: zodResolver(proposalFormSchema),
        initialValues: { ...initialProposalValues, ...draftData },
        validateInputOnChange: true,
    })

    const noteForm = useForm<ResubmitNoteValue>({
        validate: zodResolver(resubmitNoteSchema),
        initialValues: initialResubmitNoteValue,
        validateInputOnChange: true,
    })

    const { saveDraft, isSaving, lastSavedAt } = useResubmitSaveDraft({ studyId, form })
    const { resubmit, isSubmitting } = useResubmitProposal({ studyId, form, noteForm })

    const value = useMemo(
        () => ({
            studyId,
            form,
            noteForm,
            saveDraft,
            resubmit,
            isSaving,
            isSubmitting,
            lastSavedAt,
        }),
        [studyId, form, noteForm, saveDraft, resubmit, isSaving, isSubmitting, lastSavedAt],
    )

    return <EditResubmitContext.Provider value={value}>{children}</EditResubmitContext.Provider>
}
