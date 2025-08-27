import {
    useQuery,
    useMutation,
    type UseQueryOptions,
    type UseMutationOptions,
    type UseQueryResult,
    type UseMutationResult,
} from '@tanstack/react-query'
import { type ActionResponse, isActionError, ActionFailure } from '@/lib/errors'

// Helper function to process response - handles ActionResponse format and raw responses
function processResponse<T>(response: ActionResponse<T>): T {
    // If it's an error response, report it and throw
    if (isActionError(response)) {
        throw new ActionFailure(response.error)
    }

    // Otherwise, return as-is (raw response)
    return response
}

// Wrapped useQuery that automatically handles error responses
export function useWrappedQuery<TApiData>(
    options: {
        queryKey: readonly unknown[]
        queryFn: () => Promise<ActionResponse<TApiData>>
    } & Omit<UseQueryOptions<TApiData, Error, TApiData>, 'queryFn' | 'queryKey'>,
): UseQueryResult<TApiData, Error> {
    return useQuery<TApiData, Error>({
        ...options,
        queryFn: async () => {
            const response = await options.queryFn()
            return processResponse(response)
        },
    })
}

// Wrapped useMutation that automatically handles error responses
export function useWrappedMutation<TApiData, TVariables = void>(
    options: {
        mutationFn: (variables: TVariables) => Promise<ActionResponse<TApiData>>
    } & Omit<UseMutationOptions<TApiData, Error, TVariables>, 'mutationFn'>,
): UseMutationResult<TApiData, Error, TVariables> {
    return useMutation<TApiData, Error, TVariables>({
        ...options,
        mutationFn: async (variables: TVariables) => {
            const response = await options.mutationFn(variables)
            return processResponse(response)
        },
    })
}

// Re-export the unified isActionError function for backwards compatibility
export { isActionError as actionResponseIsError }
