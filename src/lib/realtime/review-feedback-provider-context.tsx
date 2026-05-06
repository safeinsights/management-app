'use client'

import { createContext, useContext, useEffect, useState, type FC, type ReactNode } from 'react'
// useEffect is used by useReviewFeedbackProvider's subscribe wiring below.
import type { HocuspocusProvider } from '@hocuspocus/provider'

// HocuspocusProviderWebsocket dispatches inbound messages by document name via
// `providerMap.set(name, provider)` / `.get(name)`. If two HocuspocusProvider
// instances attach to the same shared websocket with the same name, the second
// `attach()` overwrites the first in the map and the first goes deaf.
//
// On the review page the editor and the submission listener both wanted a
// HocuspocusProvider for `review-feedback-${studyId}`. To avoid the collision,
// the editor publishes its provider here and the listener subscribes to it
// rather than constructing a second provider for the same name.

type Subscriber = (provider: HocuspocusProvider | null) => void

type ReviewFeedbackProviderState = {
    /** Latest published HocuspocusProvider for `review-feedback-${studyId}`, or null before the editor has mounted / after teardown. */
    getProvider: () => HocuspocusProvider | null
    /** Editor-side: publish (or clear) the provider for siblings to consume. */
    publish: (provider: HocuspocusProvider | null) => void
    /** Listener-side: receive updates whenever publish() is called. */
    subscribe: (notify: Subscriber) => () => void
}

const noopState: ReviewFeedbackProviderState = {
    getProvider: () => null,
    publish: () => {},
    subscribe: () => () => {},
}

const ReviewFeedbackProviderContext = createContext<ReviewFeedbackProviderState>(noopState)

export const ReviewFeedbackProviderProvider: FC<{ children: ReactNode }> = ({ children }) => {
    const [state] = useState<ReviewFeedbackProviderState>(() => {
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

    return <ReviewFeedbackProviderContext.Provider value={state}>{children}</ReviewFeedbackProviderContext.Provider>
}

/**
 * Editor-side hook: returns a stable `publish` function suitable for passing to
 * `CollaborativeEditor`'s `onProviderReady` prop. The editor calls it with the
 * provider on creation and with null on teardown; subscribers (the listener)
 * receive both edges.
 */
export function usePublishReviewFeedbackProvider(): (provider: HocuspocusProvider | null) => void {
    return useContext(ReviewFeedbackProviderContext).publish
}

/** Listener-side hook: returns the editor's provider, updating on publish/clear. */
export function useReviewFeedbackProvider(): HocuspocusProvider | null {
    const { getProvider, subscribe } = useContext(ReviewFeedbackProviderContext)
    const [provider, setProvider] = useState<HocuspocusProvider | null>(() => getProvider())
    useEffect(() => subscribe(setProvider), [subscribe])
    return provider
}
