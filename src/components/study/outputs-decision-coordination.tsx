'use client'

import { createContext, useContext, useMemo, type FC, type ReactNode } from 'react'
import { useOutputsDecisionMonitor, type OwnSubmission } from '@/hooks/use-outputs-decision-monitor'
import type { OutputsDecisionStatus } from '@/lib/outputs-review'

type Coordination = {
    /** Reports what this tab's own mutation is doing, which is the only toast suppression rule. */
    setOwnSubmission: (next: OwnSubmission) => void
    /** The single exit to the decided screen. Idempotent, so every caller may call it. */
    finalizeDecided: (status: OutputsDecisionStatus) => void
    checkStatus: () => Promise<OutputsDecisionStatus | null>
}

const OutputsDecisionCoordinationContext = createContext<Coordination | null>(null)

type Props = {
    orgSlug: string
    studyId: string
    jobId: string
    tabSessionId: string
    enabled: boolean
    children: ReactNode
}

// Mounted above the locked/unlocked split so a reviewer who has not entered their security key is
// redirected too, and so both phases share one finalization latch.
export const OutputsDecisionCoordinationProvider: FC<Props> = ({
    orgSlug,
    studyId,
    jobId,
    tabSessionId,
    enabled,
    children,
}) => {
    const { checkStatus, finalizeDecided, setOwnSubmission } = useOutputsDecisionMonitor({
        orgSlug,
        studyId,
        jobId,
        tabSessionId,
        enabled,
    })

    const value = useMemo(
        () => ({ checkStatus, finalizeDecided, setOwnSubmission }),
        [checkStatus, finalizeDecided, setOwnSubmission],
    )

    return (
        <OutputsDecisionCoordinationContext.Provider value={value}>
            {children}
        </OutputsDecisionCoordinationContext.Provider>
    )
}

export function useOutputsDecisionCoordination(): Coordination {
    const ctx = useContext(OutputsDecisionCoordinationContext)
    if (!ctx) {
        throw new Error(
            'OutputsDecisionCoordinationProvider missing: wrap the outputs review tree in it before ' +
                'using the decision hook.',
        )
    }
    return ctx
}
