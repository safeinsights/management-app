import { describe, expect, it, mockSessionWithTestData } from '@/tests/unit.helpers'
import { redirect } from 'next/navigation'
import { Routes } from '@/lib/routes'
import OrgAdminLayout from './layout'

const renderLayout = (orgSlug: string) =>
    OrgAdminLayout({ children: <div>admin content</div>, params: Promise.resolve({ orgSlug }) })

describe('OrgAdminLayout', () => {
    it('redirects a non-admin member before the admin payload is produced', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: false })

        await renderLayout(org.slug)

        expect(redirect).toHaveBeenCalledWith(Routes.dashboard)
    })

    it('redirects an admin of a different org', async () => {
        await mockSessionWithTestData({ isAdmin: true })

        await renderLayout('some-other-org')

        expect(redirect).toHaveBeenCalledWith(Routes.dashboard)
    })

    it('renders for an org admin', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })

        await renderLayout(org.slug)

        expect(redirect).not.toHaveBeenCalled()
    })

    it('renders for an si admin who is not a member of the org', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })

        await renderLayout('an-org-they-do-not-belong-to')

        expect(redirect).not.toHaveBeenCalled()
    })
})
