'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { type UseFormReturnType } from '@mantine/form'
import { HocuspocusProviderWebsocket } from '@hocuspocus/provider'
import { useForm, zodResolver } from '@/common'
import {
    draftProposalFormSchema,
    initialProposalValues,
    type CollabFieldKey,
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

// Unconditional because this provider only ever serves a DRAFT, the route redirects
// CHANGE-REQUESTED away. `title` is excluded: Step 1 owns it on a DRAFT (OTTER-690).
const DRAFT_COLLAB_KEYS: readonly CollabFieldKey[] = ['datasets', 'piUserId', 'piName']

// An explicit `undefined` wins in a spread and would blank out the `initialProposalValues` entry,
// leaving an untouched draft with a zod type message instead of the field's own required copy.
function definedDraftFields(draftData?: DraftStudyData): DraftStudyData {
    if (!draftData) return {}
    const entries = Object.entries(draftData).filter(([, value]) => value !== undefined && value !== null)
    return Object.fromEntries(entries) as DraftStudyData
}

export function ProposalProvider({ children, studyId, draftData }: ProposalProviderProps) {
    const form = useForm<ProposalFormValues>({
        validate: zodResolver(draftProposalFormSchema),
        initialValues: { ...initialProposalValues, ...definedDraftFields(draftData) },
        // No validateInputOnChange: an error must clear while editing and stay gone until the next
        // blur or Submit, but re-validating per keystroke would put it straight back (OTTER-691).
    })

    const { websocketProvider, yjsForm, tabSessionId } = useProposalCollaboration({
        studyId,
        form,
        collabKeys: DRAFT_COLLAB_KEYS,
    })

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
