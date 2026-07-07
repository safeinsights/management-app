'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { type UseFormReturnType } from '@mantine/form'
import { HocuspocusProviderWebsocket } from '@hocuspocus/provider'
import { useForm, zodResolver } from '@/common'
import {
    proposalFormSchema,
    initialProposalValues,
    type ProposalFormValues,
} from '@/app/[orgSlug]/study/[studyId]/proposal/schema'
import { useYjsFormMap } from '@/hooks/use-yjs-form-map'
import { useProposalCollaboration } from '@/hooks/use-proposal-collaboration'
import { useSubmitProposal } from './hooks/use-submit-proposal'

interface ProposalContextValue {
    studyId: string
    form: UseFormReturnType<ProposalFormValues>
    submitProposal: () => void
    isSubmitting: boolean
    websocketProvider: HocuspocusProviderWebsocket | null
    yjsForm: ReturnType<typeof useYjsFormMap>
    /** Stable per-mount tab id used to de-dupe the broadcaster's own kick-out broadcast. */
    tabSessionId: string
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

    const { websocketProvider, yjsForm, tabSessionId } = useProposalCollaboration({ studyId, form })

    const { submitProposal, isSubmitting } = useSubmitProposal({ studyId, form, yjsForm, tabSessionId })

    const value = useMemo(
        () => ({
            studyId,
            form,
            submitProposal,
            isSubmitting,
            websocketProvider,
            yjsForm,
            tabSessionId,
        }),
        [studyId, form, submitProposal, isSubmitting, websocketProvider, yjsForm, tabSessionId],
    )

    return <ProposalContext.Provider value={value}>{children}</ProposalContext.Provider>
}
