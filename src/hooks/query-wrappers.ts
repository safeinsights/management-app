// eslint-disable-next-line no-restricted-imports
import {
    useQuery as useTanStackQuery,
    useMutation as useTanStackMutation,
    type UseQueryOptions,
    type UseMutationOptions,
    type UseQueryResult,
    type UseMutationResult,
    type UseMutateFunction,
    useQueryClient,
    skipToken,
    keepPreviousData,
} from '@tanstack/react-query'

import { type ActionResponse, isActionError, ActionFailure, isStaleDeploymentError } from '@/lib/errors'
import { reportError } from '@/components/errors'

/**
 * Read by `reportQueryError`, the shared QueryCache handler. A query opts in to having its failure
 * told to the reader by naming the title to show; without it the failure is reported nowhere, which
 * is what left a failed poll silent until the next submit (OTTER-726). `reportsOwnErrors` skips the
 * handler entirely, for a caller that captures the failure itself and would otherwise send it twice.
 */
type QueryMeta = {
    errorMessage?: string
    // For a query whose cached data stays usable when a background refetch fails.
    reportOnlyWithoutData?: boolean
    reportOnce?: boolean
    reportsOwnErrors?: boolean
}

declare module '@tanstack/react-query' {
    interface Register {
        queryMeta: QueryMeta
    }
}

const reportedQueries = new WeakSet<object>()

// The query cache's error handler, shared with the test client so tests report what the app reports.
export const reportQueryError = (error: unknown, query: { meta?: QueryMeta; state: { data: unknown } }) => {
    const { meta } = query
    if (meta?.reportsOwnErrors) return
    const quiet = !meta?.errorMessage || (meta.reportOnlyWithoutData && query.state.data !== undefined)
    if (isStaleDeploymentError(error) || (!quiet && !(meta?.reportOnce && reportedQueries.has(query)))) {
        reportError(error, meta?.errorMessage)
        if (meta?.reportOnce) reportedQueries.add(query)
    }
}

export { useTanStackMutation, useTanStackQuery, useQueryClient, skipToken, keepPreviousData }
export type { UseQueryResult, UseMutateFunction }

function processResponse<T>(response: ActionResponse<T>): T {
    if (isActionError(response)) {
        throw new ActionFailure(response.error, response.eventId)
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

// The keys a write changes. Every query under them is refetched if active, or marked stale.
export type InvalidatedKeys = readonly (readonly unknown[])[]

// Invalidates on error too, because a failed write can have committed part of its work. The
// caller's onSuccess runs after active queries refetch, so it sees fresh data. onError does not
// wait: a refetch can stall as long as the failure that caused it, and error feedback must not.
export function useMutation<TApiData, TVariables = void>(
    options: {
        mutationFn: (variables: TVariables) => Promise<ActionResponse<TApiData>>
        invalidates?: (variables: TVariables, data: TApiData | undefined) => InvalidatedKeys
        // False starts the refetch without holding the caller's callbacks until it ends.
        awaitInvalidation?: boolean
    } & Omit<UseMutationOptions<TApiData, Error, TVariables>, 'mutationFn'>,
): UseMutationResult<TApiData, Error, TVariables> {
    const queryClient = useQueryClient()
    const { invalidates, awaitInvalidation = true, onSuccess, onError, ...rest } = options
    const invalidate = (variables: TVariables, data: TApiData | undefined) => {
        const keys = invalidates?.(variables, data) ?? []
        return Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })))
    }

    return useTanStackMutation<TApiData, Error, TVariables>({
        ...rest,
        mutationFn: async (variables: TVariables) => {
            const response = await options.mutationFn(variables)
            return processResponse(response)
        },
        onSuccess: async (...args: Parameters<NonNullable<typeof onSuccess>>) => {
            const refetches = invalidate(args[1], args[0])
            if (awaitInvalidation) await refetches
            return onSuccess?.(...args)
        },
        onError: (...args: Parameters<NonNullable<typeof onError>>) => {
            void invalidate(args[1], undefined)
            return onError?.(...args)
        },
    })
}

export { isActionError as actionResponseIsError }
