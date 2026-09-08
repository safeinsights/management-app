import { TestingProviders } from '@/tests/providers'
import { render, act, waitFor } from '@testing-library/react'
import router from 'next-router-mock'
import { beforeEach, describe, expect, it } from 'vitest'
import { RequireMFA } from './require-mfa'
import { mockClerkSession } from '@/tests/unit.helpers'
import { faker } from '@faker-js/faker'

const mockSessionValues = {
    clerkUserId: faker.string.uuid(),
    userId: faker.string.uuid(),
    orgSlug: 'test-org',
}

describe('RequireMFA', () => {
    describe('when MFA is not enabled', () => {
        beforeEach(() => {
            router.setCurrentUrl('/')
        })

        it('redirects if mfa is not set', async () => {
            mockClerkSession({ ...mockSessionValues, twoFactorEnabled: false })

            await act(async () => {
                render(<RequireMFA />, { wrapper: TestingProviders })
            })

            expect(router.asPath).toEqual('/account/mfa')
        })
    })

    describe('invite signup → session lost → re-login MFA flow', () => {
        beforeEach(() => {
            router.setCurrentUrl(`/${mockSessionValues.orgSlug}/dashboard`)
        })

        it('redirects to /account/mfa until MFA is completed', async () => {
            mockClerkSession({ ...mockSessionValues, twoFactorEnabled: false })

            await act(async () => {
                render(<RequireMFA />, { wrapper: TestingProviders })
            })

            await waitFor(() => expect(router.asPath).toBe('/account/mfa'))

            mockClerkSession({ ...mockSessionValues, twoFactorEnabled: true })
            router.setCurrentUrl(`/${mockSessionValues.orgSlug}/dashboard`)

            await act(async () => {
                render(<RequireMFA />, { wrapper: TestingProviders })
            })

            expect(router.asPath).toBe(`/${mockSessionValues.orgSlug}/dashboard`)
        })
    })
})
