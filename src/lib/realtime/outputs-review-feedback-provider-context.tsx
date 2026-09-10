'use client'

import { createContext, useContext, useEffect, useState, type FC, type ReactNode } from 'react'
import type { HocuspocusProvider } from '@hocuspocus/provider'

// Mirror of review-feedback-provider-context for the outputs-review-feedback document. A distinct
// context per document name is required: HocuspocusProviderWebsocket dispatches by document name.

type Subscriber = (provider: HocuspocusProvider | null) => void

type OutputsReviewFeedbackProviderShareState = {
    getProvider: () => HocuspocusProvider | null
    publish: (provider: HocuspocusProvider | null) => void
    subscribe: (notify: Subscriber) => () => void
}

const OutputsReviewFeedbackProviderShareContext = createContext<OutputsReviewFeedbackProviderShareState | null>(null)

export const OutputsReviewFeedbackProviderShare: FC<{ children: ReactNode }> = ({ children }) => {
    const [state] = useState<OutputsReviewFeedbackProviderShareState>(() => {
        let current: HocuspocusProvider | null = null
        const subscribers = new Set<Subscriber>()
        return {
            getProvider: () => current,
            publish: (provider) => {
                current = provider
                subscribers.forEach((notify) => notify(provider))
            },
            subscribe: (notify) => {
                subscribers.add(notify)
                // The editor publishes from a child effect, which React runs before this
                // subscription is established in the parent, so a late subscriber has to be
                // handed what it missed or it waits forever for an edge that already passed.
                notify(current)
                return () => {
                    subscribers.delete(notify)
                }
            },
        }
    })

    return (
        <OutputsReviewFeedbackProviderShareContext.Provider value={state}>
            {children}
        </OutputsReviewFeedbackProviderShareContext.Provider>
    )
}

function useOutputsReviewFeedbackProviderShareContext(): OutputsReviewFeedbackProviderShareState {
    const ctx = useContext(OutputsReviewFeedbackProviderShareContext)
    if (!ctx) {
        throw new Error(
            'OutputsReviewFeedbackProviderShare missing: wrap the outputs-review page tree in ' +
                '<OutputsReviewFeedbackProviderShare> before using the editor/listener hooks.',
        )
    }
    return ctx
}

export function usePublishOutputsReviewFeedbackProvider(): (provider: HocuspocusProvider | null) => void {
    return useOutputsReviewFeedbackProviderShareContext().publish
}

export function useOutputsReviewFeedbackProvider(): HocuspocusProvider | null {
    const { getProvider, subscribe } = useOutputsReviewFeedbackProviderShareContext()
    const [provider, setProvider] = useState<HocuspocusProvider | null>(() => getProvider())
    useEffect(() => subscribe(setProvider), [subscribe])
    return provider
}
