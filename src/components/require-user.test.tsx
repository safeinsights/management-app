import { it, expect, type Mock } from 'vitest'
import { useUser } from '@clerk/nextjs'
import { RequireUser } from './require-user'
import { render, act } from '@testing-library/react'
import { TestingProviders } from '@/tests/providers'
import router from 'next-router-mock'

it('redirects if user is not found', async () => {
    ;(useUser as Mock).mockImplementation(() => ({ user: null, isSignedIn: false }))

    await act(async () => {
        render(<RequireUser />, { wrapper: TestingProviders })
    })

    expect(router.asPath).toEqual('/account/signin')
})
