import { describe, expect, it, mockSessionWithTestData } from '@/tests/unit.helpers'
import { redirect } from 'next/navigation'
import { Routes } from '@/lib/routes'
import OrgLayout from './layout'

const renderLayout = (orgSlug: string) =>
    OrgLayout({ children: <div>org content</div>, params: Promise.resolve({ orgSlug }) })

describe('OrgLayout', () => {
    it('redirects a user who is not a member of the org', async () => {
        await mockSessionWithTestData({ isAdmin: false })

        await renderLayout('an-org-they-do-not-belong-to')

        expect(redirect).toHaveBeenCalledWith(Routes.dashboard)
    })

    it('renders for a plain member of the org', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: false })

        await renderLayout(org.slug)

        expect(redirect).not.toHaveBeenCalled()
    })

    it('renders for an si admin regardless of membership', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })

        await renderLayout('an-org-they-do-not-belong-to')

        expect(redirect).not.toHaveBeenCalled()
    })
})
