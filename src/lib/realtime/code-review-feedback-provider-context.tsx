'use client'

import { createContext, useContext, useEffect, useState, type FC, type ReactNode } from 'react'
import type { HocuspocusProvider } from '@hocuspocus/provider'

// Mirror of review-feedback-provider-context for the code-review-feedback document.
// A distinct React context (and therefore distinct share state) per document name is
// required: HocuspocusProviderWebsocket dispatches inbound messages by document name,
// and the share is what lets the editor and listener (and criteria bridge) reuse a
// single HocuspocusProvider for that name without colliding in providerMap.

type Subscriber = (provider: HocuspocusProvider | null) => void

type CodeReviewFeedbackProviderShareState = {
    getProvider: () => HocuspocusProvider | null
    publish: (provider: HocuspocusProvider | null) => void
    subscribe: (notify: Subscriber) => () => void
}

const CodeReviewFeedbackProviderShareContext = createContext<CodeReviewFeedbackProviderShareState | null>(null)

export const CodeReviewFeedbackProviderShare: FC<{ children: ReactNode }> = ({ children }) => {
    const [state] = useState<CodeReviewFeedbackProviderShareState>(() => {
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
                return () => {
                    subscribers.delete(notify)
                }
            },
        }
    })

    return (
        <CodeReviewFeedbackProviderShareContext.Provider value={state}>
            {children}
        </CodeReviewFeedbackProviderShareContext.Provider>
    )
}

function useCodeReviewFeedbackProviderShareContext(): CodeReviewFeedbackProviderShareState {
    const ctx = useContext(CodeReviewFeedbackProviderShareContext)
    if (!ctx) {
        throw new Error(
            'CodeReviewFeedbackProviderShare missing: wrap the code-review page tree in ' +
                '<CodeReviewFeedbackProviderShare> before using the editor/listener hooks.',
        )
    }
    return ctx
}

export function usePublishCodeReviewFeedbackProvider(): (provider: HocuspocusProvider | null) => void {
    return useCodeReviewFeedbackProviderShareContext().publish
}

export function useCodeReviewFeedbackProvider(): HocuspocusProvider | null {
    const { getProvider, subscribe } = useCodeReviewFeedbackProviderShareContext()
    const [provider, setProvider] = useState<HocuspocusProvider | null>(() => getProvider())
    useEffect(() => subscribe(setProvider), [subscribe])
    return provider
}
