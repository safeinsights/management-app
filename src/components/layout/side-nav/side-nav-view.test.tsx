import { describe, expect, it, renderWithProviders, screen, within } from '@/tests/unit.helpers'
import { ExternalLinks, Routes } from '@/lib/routes'
import type { NavOrg } from '@/lib/nav/side-nav'
import { SideNavView } from './side-nav-view'

const partner: NavOrg = { id: '1', name: 'Open Data Partner', slug: 'partner', type: 'enclave', isAdmin: true }
const lab: NavOrg = { id: '2', name: 'Rice Lab', slug: 'lab', type: 'lab', isAdmin: false }

describe('SideNavView', () => {
    it('lists My studies first, then the orgs by name with their type badge and admin label', () => {
        renderWithProviders(<SideNavView orgs={[partner, lab]} focusedOrgSlug={null} pathname={Routes.dashboard} />)

        const nav = screen.getByRole('navigation', { name: 'Main' })
        const links = within(nav).getAllByRole('link')
        expect(links[1]).toHaveTextContent('My studies')
        expect(links[1]).toHaveAttribute('aria-current', 'page')

        const partnerRow = within(nav).getByRole('link', { name: /Open Data Partner/ })
        expect(within(partnerRow).getByRole('img', { name: 'Data partner' })).toBeInTheDocument()
        expect(partnerRow).toHaveTextContent('Admin')
        expect(partnerRow).toHaveAttribute('href', Routes.orgDashboard({ orgSlug: 'partner' }))

        const labRow = within(nav).getByRole('link', { name: /Rice Lab/ })
        expect(within(labRow).getByRole('img', { name: 'Research lab' })).toBeInTheDocument()
        expect(labRow).not.toHaveTextContent('Admin')
    })

    // The design fills the D square and only outlines the R one, so the two icons must not share a shape.
    it('draws a different icon for each org type', () => {
        renderWithProviders(<SideNavView orgs={[partner, lab]} focusedOrgSlug={null} pathname={Routes.dashboard} />)

        const iconPath = (name: string) =>
            screen.getByRole('img', { name }).querySelector('svg path')?.getAttribute('d') ?? ''

        expect(iconPath('Data partner')).not.toBe('')
        expect(iconPath('Research lab')).not.toBe('')
        expect(iconPath('Data partner')).not.toBe(iconPath('Research lab'))
    })

    it('opens only the org in the path and marks its dashboard current on a study page', () => {
        renderWithProviders(
            <SideNavView
                orgs={[partner, lab]}
                focusedOrgSlug="partner"
                pathname={Routes.studyRequest({ orgSlug: 'partner' })}
            />,
        )

        expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page')
        expect(screen.getByRole('link', { name: 'Admin settings' })).toHaveAttribute(
            'href',
            Routes.adminSettings({ orgSlug: 'partner' }),
        )
        expect(screen.getByRole('link', { name: 'Manage team' })).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Legal center' })).toBeInTheDocument()
        expect(screen.getAllByRole('link', { name: 'Dashboard' })).toHaveLength(1)
    })

    it('links the external pages in new tabs based on the org types the user belongs to', () => {
        renderWithProviders(<SideNavView orgs={[lab]} focusedOrgSlug={null} pathname={Routes.dashboard} />)

        const catalog = screen.getByRole('link', { name: /Data catalog/ })
        expect(catalog).toHaveAttribute('href', ExternalLinks.dataCatalog)
        expect(catalog).toHaveAttribute('target', '_blank')
        expect(catalog).toHaveTextContent('(opens in a new tab)')
        expect(screen.queryByRole('link', { name: /Resource center/ })).toBeNull()
        expect(screen.getByRole('link', { name: /Support/ })).toHaveAttribute('href', ExternalLinks.support)
    })

    it('sends the logo to My studies', () => {
        renderWithProviders(<SideNavView orgs={[]} focusedOrgSlug={null} pathname={Routes.legal} />)

        expect(screen.getByRole('link', { name: /SafeInsights/ })).toHaveAttribute('href', Routes.dashboard)
    })
})
