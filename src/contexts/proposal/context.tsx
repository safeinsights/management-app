'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { type UseFormReturnType } from '@mantine/form'
import { useForm, zodResolver } from '@/common'
import { proposalFormSchema, initialProposalValues, type ProposalFormValues } from '@/app/[orgSlug]/study/[studyId]/proposal/schema'
import { useSaveDraft } from './hooks/use-save-draft'
import { useSubmitProposal } from './hooks/use-submit-proposal'

interface ProposalContextValue {
    studyId: string
    form: UseFormReturnType<ProposalFormValues>
    saveDraft: () => Promise<void>
    submitProposal: () => Promise<void>
    isSaving: boolean
    isSubmitting: boolean
    isSubmitted: boolean
}

const ProposalContext = createContext<ProposalContextValue | null>(null)

export function useProposal(): ProposalContextValue {
    const context = useContext(ProposalContext)
    if (!context) {
        throw new Error('useProposal must be used within ProposalProvider')
    }
    return context
}

export type DraftStudyData = Partial<ProposalFormValues>

interface ProposalProviderProps {
    children: ReactNode
    studyId: string
    draftData?: DraftStudyData
}

export function ProposalProvider({ children, studyId, draftData }: ProposalProviderProps) {
    const form = useForm<ProposalFormValues>({
        validate: zodResolver(proposalFormSchema),
        initialValues: { ...initialProposalValues, ...draftData },
        validateInputOnChange: true,
    })

    const { saveDraft, isSaving, buildStudyInfo } = useSaveDraft({ studyId, form })
    const { submitProposal, isSubmitting, isSubmitted } = useSubmitProposal({ studyId, form, buildStudyInfo })

    const value = useMemo(
        () => ({
            studyId,
            form,
            saveDraft,
            submitProposal,
            isSaving,
            isSubmitting,
            isSubmitted,
        }),
        [studyId, form, saveDraft, submitProposal, isSaving, isSubmitting, isSubmitted],
    )

    return <ProposalContext.Provider value={value}>{children}</ProposalContext.Provider>
}
