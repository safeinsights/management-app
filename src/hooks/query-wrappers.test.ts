import {
    act,
    beforeEach,
    createTestQueryClient,
    createTestQueryWrapper,
    describe,
    expect,
    it,
    renderHook,
    vi,
    waitFor,
} from '@/tests/unit.helpers'
import { useQuery, useMutation } from './query-wrappers'
import { type ActionResponse } from '@/lib/types'
import { queryKeys } from '@/lib/query-keys'

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
                        queryKey: queryKeys.study('test-error'),
                        queryFn: mockQueryFn,
                    }),
                { wrapper: createTestQueryWrapper() },
            )

            await waitFor(() => expect(result.current.isError).toBe(true))
        })

        it('should return raw data when response is not ActionResponse format', async () => {
            const mockData = { id: 1, name: 'test' }
            const mockQueryFn = (): Promise<typeof mockData> => Promise.resolve(mockData)

            const { result } = renderHook(
                () =>
                    useQuery({
                        queryKey: queryKeys.study('test-raw'),
                        queryFn: mockQueryFn,
                    }),
                { wrapper: createTestQueryWrapper() },
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
                        queryKey: queryKeys.study('test-complex'),
                        queryFn: mockQueryFn,
                    }),
                { wrapper: createTestQueryWrapper() },
            )

            await waitFor(() => expect(result.current.isSuccess).toBe(true))

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
                { wrapper: createTestQueryWrapper() },
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
                { wrapper: createTestQueryWrapper() },
            )

            result.current.mutate('test-input')

            await waitFor(() => expect(result.current.isSuccess).toBe(true))

            expect(result.current.data).toEqual(mockData)
        })
    })

    describe('useMutation invalidates', () => {
        const key = queryKeys.study('invalidated')

        // A query whose second and later fetches wait until the test releases them, so the test can
        // see what the mutation does while the refetch is still in flight.
        const setup = (mutationFn: () => Promise<ActionResponse<string>>) => {
            const order: string[] = []
            let release = () => {}
            let fetches = 0
            const queryFn = () => {
                fetches++
                if (fetches === 1) return Promise.resolve('first')
                order.push('refetch started')
                return new Promise<string>((resolve) => {
                    release = () => {
                        order.push('refetch done')
                        resolve('second')
                    }
                })
            }
            const onSettled = vi.fn()
            const { result } = renderHook(
                () => ({
                    query: useQuery({ queryKey: key, queryFn }),
                    mutation: useMutation<string, void>({
                        mutationFn,
                        invalidates: () => [key],
                        onSuccess: () => void order.push('onSuccess'),
                        onError: () => void order.push('onError'),
                        onSettled,
                    }),
                }),
                { wrapper: createTestQueryWrapper({ queryClient: createTestQueryClient() }) },
            )
            return { result, order, onSettled, release: () => release() }
        }

        it('refetches an active query before the caller onSuccess runs, and stays pending until then', async () => {
            const { result, order, onSettled, release } = setup(() => Promise.resolve('saved'))
            await waitFor(() => expect(result.current.query.data).toBe('first'))

            act(() => result.current.mutation.mutate())
            await waitFor(() => expect(order).toEqual(['refetch started']))
            expect(result.current.mutation.isPending).toBe(true)

            act(() => release())
            await waitFor(() => expect(result.current.mutation.isSuccess).toBe(true))
            expect(order).toEqual(['refetch started', 'refetch done', 'onSuccess'])
            expect(result.current.query.data).toBe('second')
            expect(onSettled).toHaveBeenCalledOnce()
        })

        it('refetches on a failed write too, before the caller onError runs', async () => {
            const { result, order, onSettled, release } = setup(() => Promise.resolve({ error: 'nope' }))
            await waitFor(() => expect(result.current.query.data).toBe('first'))

            act(() => result.current.mutation.mutate())
            await waitFor(() => expect(order).toEqual(['refetch started']))

            act(() => release())
            await waitFor(() => expect(result.current.mutation.isError).toBe(true))
            expect(order).toEqual(['refetch started', 'refetch done', 'onError'])
            expect(onSettled).toHaveBeenCalledOnce()
        })

        it('passes the variables and the result to invalidates', async () => {
            const invalidates = vi.fn(() => [])
            const { result } = renderHook(
                () => useMutation({ mutationFn: (id: string) => Promise.resolve(`saved ${id}`), invalidates }),
                { wrapper: createTestQueryWrapper() },
            )

            act(() => result.current.mutate('a'))
            await waitFor(() => expect(result.current.isSuccess).toBe(true))
            expect(invalidates).toHaveBeenCalledWith('a', 'saved a')
        })
    })
})
