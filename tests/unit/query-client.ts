import { reportQueryError } from '@/hooks/query-wrappers'
// eslint-disable-next-line no-restricted-imports
import { QueryCache, QueryClient } from '@tanstack/react-query'
import { waitFor } from '@testing-library/react'
import { expect } from 'vitest'
import { setMockedLayoutUserInfo } from './layout-user-info'

// Tracked so resetTestQueryClients can tear them down: a still-live client's refetchInterval
// timer otherwise fires during the NEXT test, flipping component state.
const liveTestQueryClients = new Set<QueryClient>()

export const createTestQueryClient = () => {
    const client = new QueryClient({
        queryCache: new QueryCache({ onError: reportQueryError }),
        defaultOptions: {
            queries: {
                retry: false,
                refetchOnMount: false,
                refetchOnWindowFocus: false,
                refetchOnReconnect: false,
            },
            mutations: {
                retry: false,
            },
        },
    })
    liveTestQueryClients.add(client)
    return client
}

// Mutations only: a read action opens no transaction and issues plain SELECTs, so a late one
// cannot commit anything. A pending mutation can, see the teardown check in vitest.setup.ts.
export const pendingTestMutationCount = () =>
    [...liveTestQueryClients].reduce((count, client) => count + client.isMutating(), 0)

// Names what is still in flight. The teardown failure is otherwise reported with no test attached,
// which leaves a CI-only failure to be found by bisection.
export const pendingTestMutationDescriptions = () =>
    [...liveTestQueryClients].flatMap((client) =>
        client
            .getMutationCache()
            .getAll()
            .filter((mutation) => mutation.state.status === 'pending')
            .map((mutation) => {
                const key = mutation.options.mutationKey
                const variables = JSON.stringify(mutation.state.variables ?? null)?.slice(0, 200)
                return `${key ? JSON.stringify(key) : '<no mutationKey>'} variables=${variables}`
            }),
    )

// The read counterpart of pendingTestMutationCount. Nothing fails a test for a query still in
// flight, but a component whose enabled-ness depends on one needs it settled before interaction.
export const pendingTestQueryCount = () =>
    [...liveTestQueryClients].reduce((count, client) => count + client.isFetching(), 0)

// Waits for every in-flight read to land. Cheap to poll, unlike retrying the interaction itself,
// so it tolerates a slow machine instead of spending the budget on repeated clicks.
export const waitForPendingQueries = () =>
    waitFor(() => {
        expect(pendingTestQueryCount()).toBe(0)
    })

// Captured before any test can fake timers, so the teardown bound below always elapses.
const realSetTimeout = globalThis.setTimeout

// A read still in flight at teardown would finish during the next test, after this test's rows are
// rolled back and against the next test's mocks. Bounded: a test may leave a fetch that never settles.
export const settleTestQueries = async (otherReads: Promise<unknown>[] = [], timeoutMs = 2000) => {
    const inFlight = [...liveTestQueryClients].flatMap((client) =>
        client
            .getQueryCache()
            .getAll()
            .flatMap((query) => (query.state.fetchStatus === 'fetching' && query.promise ? [query.promise] : [])),
    )
    inFlight.push(...otherReads)
    if (!inFlight.length) return
    await Promise.race([Promise.allSettled(inFlight), new Promise((resolve) => realSetTimeout(resolve, timeoutMs))])
}

// The teardown check in vitest.setup.ts fails a test that leaves a write in flight. Use this when
// the mutation is a side effect the test does not otherwise assert on — a first-visit record, an
// optimistic save — rather than reaching for an unrelated assertion to stall on.
export const waitForPendingMutations = () =>
    waitFor(() => {
        expect(pendingTestMutationCount()).toBe(0)
    })

// Must run after RTL cleanup(), which removes the observers; this clears the data behind them.
export const resetTestQueryClients = () => {
    for (const client of liveTestQueryClients) {
        client.clear()
    }
    liveTestQueryClients.clear()
    setMockedLayoutUserInfo(null)
}
