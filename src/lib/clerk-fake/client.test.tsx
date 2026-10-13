import { act, describe, expect, it, renderHook, type Mock } from '@/tests/unit.helpers'
import { memoryRouter } from 'next-router-mock'
import { useClerk, useSignIn } from './client'

// next-router-mock has no app-router refresh(); tests/vitest.setup.ts adds it as a mock.
const routerRefresh = () => (memoryRouter as unknown as { refresh: Mock }).refresh

// Real Clerk refreshes the router after both, which re-renders the root layout's org list.
describe('clerk fake auth changes', () => {
    it('refreshes the router after setActive', async () => {
        const { result } = renderHook(() => useSignIn())

        await act(() => result.current.setActive({ session: 'e2e-session-researcher' }))

        expect(routerRefresh()).toHaveBeenCalled()
    })

    it('refreshes the router after signOut', async () => {
        const { result } = renderHook(() => useClerk())

        await act(() => result.current.signOut())

        expect(routerRefresh()).toHaveBeenCalled()
    })
})
