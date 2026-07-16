'use client'

import { createContext, createElement, useCallback, useContext, useRef, type ReactNode } from 'react'

import { useMutation, useQueryClient } from '@/common'
import { reportMutationError } from '@/components/errors'
import { actionResult } from '@/lib/utils'
import { startProposalRevisionAction } from '@/server/actions/study-request'

// Every dashboard query that shows proposal status. The flip removes a study from the reviewer's
// actionable queue and relabels it "Proposal draft" for the researcher, so both must refetch.
const RESEARCHER_DASHBOARD_KEYS = [['researcher-studies'], ['user-researcher-studies'], ['user-orgs']] as const

type Args = {
    studyId: string
    orgSlug: string
    /**
     * True only while the study still needs the flip (its initial status is CHANGE-REQUESTED). A
     * revision draft is already flipped and a fresh draft never flips, so both pass `false` and
     * `signalRealEdit` becomes a no-op.
     */
    enabled: boolean
}

export type ProposalRevisionSignal = {
    /** Call on every local user edit; fires the transition at most once (see hook docs). */
    signalRealEdit: () => void
    isStartingRevision: boolean
    revisionStartFailed: boolean
    revisionStarted: boolean
    /** True while the transition is pending or has failed — Resubmit must stay disabled. */
    blockResubmit: boolean
}

/**
 * OTTER-636: turns the first real local edit of a change-requested proposal into the server-side
 * transition to a revision DRAFT. `signalRealEdit` is safe to call on every keystroke: it fires the
 * transition at most once per mount (the action is also idempotent server-side), and re-arms only if
 * the attempt failed so a later edit retries without the caller tracking state.
 *
 * Starting the revision and persisting content are independent operations (the editor keeps
 * autosaving through Yjs / the draft columns). This hook owns only the status transition and reports
 * its own pending/failed state so the Resubmit button can stay disabled until the flip lands.
 */
export function useStartProposalRevision({ studyId, orgSlug, enabled }: Args): ProposalRevisionSignal {
    const queryClient = useQueryClient()
    // Guards against re-firing while a request is in flight or after it has succeeded. Reset in
    // onError so the next local edit re-attempts once react-query's automatic retries are exhausted.
    const attemptedRef = useRef(false)

    const { mutate, isPending, isError, isSuccess } = useMutation({
        mutationFn: async () => actionResult(await startProposalRevisionAction({ studyId })),
        retry: 2,
        onError: (err) => {
            attemptedRef.current = false
            reportMutationError('Could not start your revision. Your edits are safe; keep typing to retry.')(err)
        },
        onSuccess: () => {
            for (const queryKey of RESEARCHER_DASHBOARD_KEYS) {
                queryClient.invalidateQueries({ queryKey })
            }
            queryClient.invalidateQueries({ queryKey: ['org-studies', orgSlug] })
        },
    })

    const signalRealEdit = useCallback(() => {
        if (!enabled || attemptedRef.current) return
        attemptedRef.current = true
        mutate()
    }, [enabled, mutate])

    return {
        signalRealEdit,
        isStartingRevision: isPending,
        revisionStartFailed: isError,
        revisionStarted: isSuccess,
        blockResubmit: enabled && (isPending || isError),
    }
}

// Disabled default so any editing surface can call `useProposalRevision()` unconditionally. The fresh
// proposal form renders the same field components but mounts no provider, so it gets these no-ops.
const DISABLED_SIGNAL: ProposalRevisionSignal = {
    signalRealEdit: () => {},
    isStartingRevision: false,
    revisionStartFailed: false,
    revisionStarted: false,
    blockResubmit: false,
}

const ProposalRevisionContext = createContext<ProposalRevisionSignal>(DISABLED_SIGNAL)

/** Read the revision signal. Returns no-ops when no provider is mounted (e.g. the fresh-draft form). */
export function useProposalRevision(): ProposalRevisionSignal {
    return useContext(ProposalRevisionContext)
}

type ProviderProps = Args & { children: ReactNode }

/**
 * Wraps the edit-and-resubmit form so its editable inputs can signal a real edit and its footer can
 * gate Resubmit on the transition state, without threading callbacks through every layer.
 */
export function ProposalRevisionProvider({ children, ...args }: ProviderProps) {
    const signal = useStartProposalRevision(args)
    return createElement(ProposalRevisionContext.Provider, { value: signal }, children)
}
