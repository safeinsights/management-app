'use client'

import type { ReactNode } from 'react'
import { type UseQueryResult } from '@/common'
import { ErrorPanel } from '@/components/panel'
import { LoadingMessage } from '@/components/loading'

const failureTitle = (label: string, error: Error | null) =>
    `Failed to load ${label}: ${error?.message || 'Unknown error'}`

export type QueryStateBodyProps = {
    query: UseQueryResult<unknown, Error>
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
