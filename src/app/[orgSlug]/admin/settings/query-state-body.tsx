'use client'

import type { ReactNode } from 'react'
import { ErrorPanel } from '@/components/panel'
import { LoadingMessage } from '@/components/loading'

// Structural rather than tanstack's UseQueryResult, which @/common does not re-export.
export type QueryState = {
    isLoading: boolean
    isError: boolean
    error: Error | null
    refetch: () => void
}

const failureTitle = (label: string, error: Error | null) =>
    `Failed to load ${label}: ${error?.message || 'Unknown error'}`

export type QueryStateBodyProps = {
    query: QueryState
    loadingMessage: string
    errorLabel: string
    children: ReactNode
}

export function QueryStateBody({ query, loadingMessage, errorLabel, children }: QueryStateBodyProps) {
    if (query.isLoading) return <LoadingMessage message={loadingMessage} />

    if (query.isError) {
        return (
            <ErrorPanel title={failureTitle(errorLabel, query.error)} onContinue={query.refetch}>
                Retry
            </ErrorPanel>
        )
    }

    return <>{children}</>
}
