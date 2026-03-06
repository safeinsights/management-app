import {
    describe,
    it,
    expect,
    vi,
    beforeEach,
    renderHook,
    waitFor,
    createTestQueryClient,
    QueryClientProvider,
} from '@/tests/unit.helpers'
import { useQuery, useMutation } from './query-wrappers'
import { type ActionResponse } from '@/lib/types'
import React from 'react'

const createWrapper = () => {
    const queryClient = createTestQueryClient()
    const Wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(QueryClientProvider, { client: queryClient }, children)
    Wrapper.displayName = 'QueryClientWrapper'
    return Wrapper
}

describe('Query Wrappers', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe('useQuery', () => {
        it('should handle error when API response has error property', async () => {
            const errorMessage = 'Something went wrong'
            const mockQueryFn = vi.fn().mockResolvedValue({ error: errorMessage } as ActionResponse<unknown>)

            const { result } = renderHook(
                () =>
                    useQuery({
                        queryKey: ['test-error'],
                        queryFn: mockQueryFn,
                    }),
                { wrapper: createWrapper() },
            )

            await waitFor(() => expect(result.current.isError).toBe(true))
        })

        it('should return raw data when response is not ActionResponse format', async () => {
            const mockData = { id: 1, name: 'test' }
            const mockQueryFn = (): Promise<typeof mockData> => Promise.resolve(mockData)

            const { result } = renderHook(
                () =>
                    useQuery({
                        queryKey: ['test-raw'],
                        queryFn: mockQueryFn,
                    }),
                { wrapper: createWrapper() },
            )

            await waitFor(() => expect(result.current.isSuccess).toBe(true))

            expect(result.current.data).toEqual(mockData)
            if (result.current.data) {
                expect(result.current.data.id).toBe(1)
                expect(result.current.data.name).toBe('test')
            }
        })

        it('should pass through objects with data property that are not error responses', async () => {
            const mockData = { data: 'some data', status: 'success', someOtherProp: true }
            const mockQueryFn = (): Promise<typeof mockData> => Promise.resolve(mockData)

            const { result } = renderHook(
                () =>
                    useQuery({
                        queryKey: ['test-complex'],
                        queryFn: mockQueryFn,
                    }),
                { wrapper: createWrapper() },
            )

            await waitFor(() => expect(result.current.isSuccess).toBe(true))

            // Should pass through complex objects that aren't error responses
            expect(result.current.data).toEqual(mockData)
        })
    })

    describe('useMutation', () => {
        it('should handle error when API response has error property', async () => {
            const errorMessage = 'Mutation failed'
            const mockMutationFn = vi.fn().mockResolvedValue({ error: errorMessage } as ActionResponse<unknown>)

            const { result } = renderHook(
                () =>
                    useMutation({
                        mutationFn: mockMutationFn,
                    }),
                { wrapper: createWrapper() },
            )

            result.current.mutate('test-input')

            await waitFor(() => expect(result.current.isError).toBe(true))
        })

        it('should return raw data when response is not ActionResponse format', async () => {
            const mockData = { success: true }
            const mockMutationFn = vi.fn().mockResolvedValue(mockData)

            const { result } = renderHook(
                () =>
                    useMutation({
                        mutationFn: mockMutationFn,
                    }),
                { wrapper: createWrapper() },
            )

            result.current.mutate('test-input')

            await waitFor(() => expect(result.current.isSuccess).toBe(true))

            expect(result.current.data).toEqual(mockData)
        })
    })
})
