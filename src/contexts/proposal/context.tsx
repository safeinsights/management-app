'use client'

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { type UseFormReturnType } from '@mantine/form'
import { HocuspocusProviderWebsocket } from '@hocuspocus/provider'
import { useForm, zodResolver } from '@/common'
import {
    proposalFormSchema,
    initialProposalValues,
    type ProposalFormValues,
} from '@/app/[orgSlug]/study/[studyId]/proposal/schema'
import { useProposalCollaborationFeatureFlag } from '@/components/openstax-feature-flag'
import { WS_URL } from '@/server/config'
import { useYjsFormMap } from '@/hooks/use-yjs-form-map'
import { useSaveDraft } from './hooks/use-save-draft'
import { useSubmitProposal } from './hooks/use-submit-proposal'

interface ProposalContextValue {
    studyId: string
    form: UseFormReturnType<ProposalFormValues>
    saveDraft: () => Promise<boolean>
    submitProposal: () => void
    isSaving: boolean
    isSubmitting: boolean
    isCollaborationEnabled: boolean
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
    const isCollaborationEnabled = useProposalCollaborationFeatureFlag()

    // One id per mount of the provider. Different tabs get different ids even for
    // the same Clerk user, which is what the listener compares against to skip
    // only the broadcaster's own tab.
    const [tabSessionId] = useState(() => crypto.randomUUID())

    const form = useForm<ProposalFormValues>({
        validate: zodResolver(proposalFormSchema),
        initialValues: { ...initialProposalValues, ...draftData },
        validateInputOnChange: true,
    })

    const [websocketProvider, setWebsocketProvider] = useState<HocuspocusProviderWebsocket | null>(null)

    useEffect(() => {
        if (!isCollaborationEnabled) return undefined
        const provider = new HocuspocusProviderWebsocket({ url: WS_URL })
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setWebsocketProvider(provider)
        return () => {
            provider.destroy()

            setWebsocketProvider(null)
        }
    }, [isCollaborationEnabled])

    const yjsForm = useYjsFormMap({
        studyId,
        form,
        websocketProvider,
        enabled: isCollaborationEnabled,
    })

    const { saveDraft, isSaving } = useSaveDraft({ studyId, form })
    const { submitProposal, isSubmitting } = useSubmitProposal({ studyId, form, yjsForm, tabSessionId })

    const value = useMemo(
        () => ({
            studyId,
            form,
            saveDraft,
            submitProposal,
            isSaving,
            isSubmitting,
            isCollaborationEnabled,
            websocketProvider,
            yjsForm,
            tabSessionId,
        }),
        [
            studyId,
            form,
            saveDraft,
            submitProposal,
            isSaving,
            isSubmitting,
            isCollaborationEnabled,
            websocketProvider,
            yjsForm,
            tabSessionId,
        ],
    )

    return <ProposalContext.Provider value={value}>{children}</ProposalContext.Provider>
}
