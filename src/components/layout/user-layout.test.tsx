import { it, expect, beforeEach } from 'vitest'
import { UserLayout } from './user-layout'
import { render, screen } from '@testing-library/react'
import router from 'next-router-mock'

import { TestingProviders } from '@/tests/providers'
import { mockSessionWithTestData } from '@/tests/unit.helpers'

beforeEach(() => {
    router.setCurrentUrl('/')
})

it('redirects to MFA setup if twoFactorEnabled is false', async () => {
    const { useUserReturn } = await mockSessionWithTestData()

    useUserReturn.user.twoFactorEnabled = false

    render(
        <UserLayout>
            <div>hello world</div>
        </UserLayout>,
        { wrapper: TestingProviders },
    )

    await screen.findByText('hello world')
    expect(router.asPath).toEqual('/account/mfa')
})
