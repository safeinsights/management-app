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

// Everything below is unconditional because this provider only ever serves a DRAFT: the route
// redirects CHANGE-REQUESTED to /edit-and-resubmit (see proposal/page.tsx). Do not reintroduce a
// `status` prop and half-branch these; if that redirect is ever reverted, all of them have to
// branch together.
//
// `title` is excluded: Step 1 owns study.title on a DRAFT (OTTER-690). Leaving it in would let a
// cold fields-doc seed a blank title, or a stale persisted one, over the Step 1 value via the
// server-side mirror.
const DRAFT_COLLAB_KEYS: readonly CollabFieldKey[] = ['datasets', 'piUserId', 'piName']

export function ProposalProvider({ children, studyId, draftData }: ProposalProviderProps) {
    const form = useForm<ProposalFormValues>({
        validate: zodResolver(draftProposalFormSchema),
        initialValues: { ...initialProposalValues, ...draftData },
        // No validateInputOnChange: the card requires that an error clears while the user is
        // editing and does not come back until the next blur or Submit click. Mantine's
        // clearInputErrorOnChange (on by default) does the clearing; re-validating on every
        // keystroke would put the message straight back (OTTER-691).
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
