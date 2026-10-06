// eslint-disable-next-line no-restricted-imports
import {
    useQuery as useTanStackQuery,
    useMutation as useTanStackMutation,
    type UseQueryOptions,
    type UseMutationOptions,
    type UseQueryResult,
    type UseMutationResult,
    useQueryClient,
    skipToken,
    keepPreviousData,
} from '@tanstack/react-query'

import { type ActionResponse, isActionError, ActionFailure, isStaleDeploymentError } from '@/lib/errors'
import { reportError } from '@/components/errors'

/**
 * Read by `reportQueryError`, the shared QueryCache handler. A query opts in to having its failure
 * told to the reader by naming the title to show; without it the failure is reported nowhere, which
 * is what left a failed poll silent until the next submit (OTTER-726).
 */
type QueryMeta = {
    errorMessage?: string
    // For a query whose cached data stays usable when a background refetch fails.
    reportOnlyWithoutData?: boolean
}

declare module '@tanstack/react-query' {
    interface Register {
        queryMeta: QueryMeta
    }
}

// The query cache's error handler, shared with the test client so tests report what the app reports.
export const reportQueryError = (error: unknown, query: { meta?: QueryMeta; state: { data: unknown } }) => {
    const { meta } = query
    const quiet = !meta?.errorMessage || (meta.reportOnlyWithoutData && query.state.data !== undefined)
    if (isStaleDeploymentError(error) || !quiet) reportError(error, meta?.errorMessage)
}

export { useTanStackMutation, useTanStackQuery, useQueryClient, skipToken, keepPreviousData }
export type { UseQueryResult }

function processResponse<T>(response: ActionResponse<T>): T {
    if (isActionError(response)) {
        throw new ActionFailure(response.error)
    }

    return response
}

export function useQuery<TApiData>(
    options: {
        queryKey: readonly unknown[]
        queryFn: () => Promise<ActionResponse<TApiData>>
    } & Omit<UseQueryOptions<TApiData, Error, TApiData>, 'queryFn' | 'queryKey'>,
): UseQueryResult<TApiData, Error> {
    return useTanStackQuery<TApiData, Error>({
        ...options,
        queryFn: async () => {
            const response = await options.queryFn()
            return processResponse(response)
        },
    })
}

export function useMutation<TApiData, TVariables = void>(
    options: {
        mutationFn: (variables: TVariables) => Promise<ActionResponse<TApiData>>
    } & Omit<UseMutationOptions<TApiData, Error, TVariables>, 'mutationFn'>,
): UseMutationResult<TApiData, Error, TVariables> {
    return useTanStackMutation<TApiData, Error, TVariables>({
        ...options,
        mutationFn: async (variables: TVariables) => {
            const response = await options.mutationFn(variables)
            return processResponse(response)
        },
    })
}

export { isActionError as actionResponseIsError }
