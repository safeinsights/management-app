'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { type UseFormReturnType } from '@mantine/form'
import { useForm, zodResolver } from '@/common'
import { step2FormSchema, initialStep2Values, type Step2FormValues } from './step2-schema'
import { useSaveDraft } from './hooks/use-save-draft'
import { useSubmitProposal } from './hooks/use-submit-proposal'

interface Step2ContextValue {
    studyId: string
    form: UseFormReturnType<Step2FormValues>
    saveDraft: () => Promise<void>
    submitProposal: () => Promise<void>
    isSaving: boolean
    isSubmitting: boolean
    isSubmitted: boolean
}

const Step2Context = createContext<Step2ContextValue | null>(null)

export function useStep2(): Step2ContextValue {
    const context = useContext(Step2Context)
    if (!context) {
        throw new Error('useStep2 must be used within Step2Provider')
    }
    return context
}

export type DraftStudyData = Partial<Step2FormValues>

interface Step2ProviderProps {
    children: ReactNode
    studyId: string
    draftData?: DraftStudyData
}

export function Step2Provider({ children, studyId, draftData }: Step2ProviderProps) {
    const form = useForm<Step2FormValues>({
        validate: zodResolver(step2FormSchema),
        initialValues: { ...initialStep2Values, ...draftData },
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

    return <Step2Context.Provider value={value}>{children}</Step2Context.Provider>
}
