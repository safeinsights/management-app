import { it, expect, type Mock } from 'vitest'
import { useUser } from '@clerk/nextjs'
import { RequireUser } from './require-user'
import { act } from '@testing-library/react'
import { renderWithProviders } from '@/tests/unit.helpers'
import router from 'next-router-mock'

it('redirects if user is not found', async () => {
    ;(useUser as Mock).mockImplementation(() => ({ user: null, isSignedIn: false }))

    await act(async () => {
        renderWithProviders(<RequireUser />)
    })

    expect(router.asPath).toEqual('/account/signin')
})
