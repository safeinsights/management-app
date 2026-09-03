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

import { type ActionResponse, isActionError, ActionFailure } from '@/lib/errors'

export { useTanStackMutation, useTanStackQuery, useQueryClient, skipToken, keepPreviousData }

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
