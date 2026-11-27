import { act, describe, expect, it, renderHook, type Mock } from '@/tests/unit.helpers'
import { memoryRouter } from 'next-router-mock'
import { useClerk, useSignIn } from './client'
import { ROLE_FIXTURES } from './fixtures'
import { MFA_CODE } from './sign-in-resource'

// next-router-mock has no app-router refresh(); tests/vitest.setup.ts adds it as a mock.
const routerRefresh = () => (memoryRouter as unknown as { refresh: Mock }).refresh

// Real Clerk refreshes the router after both, which re-renders the root layout's org list.
describe('clerk fake auth changes', () => {
    it('refreshes the router after finalize', async () => {
        const { result } = renderHook(() => useSignIn())
        const { signIn } = result.current

        await act(async () => {
            await signIn.password({ identifier: ROLE_FIXTURES.researcher.email, password: 'whatever' })
            await signIn.mfa.verifyPhoneCode({ code: MFA_CODE })
            await signIn.finalize()
        })

        expect(routerRefresh()).toHaveBeenCalled()
    })

    it('refreshes the router after signOut', async () => {
        const { result } = renderHook(() => useClerk())

        await act(() => result.current.signOut())

        expect(routerRefresh()).toHaveBeenCalled()
    })
})
