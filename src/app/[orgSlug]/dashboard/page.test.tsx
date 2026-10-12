import {
    describe,
    expect,
    faker,
    insertTestOrg,
    it,
    mockDualRoleSessionWithTestData,
    mockSessionWithTestData,
    pageHeaderEyebrow,
    renderWithProviders,
    screen,
} from '@/tests/unit.helpers'
import OrgDashboardPage from './page'

const renderDashboard = async (orgSlug: string) =>
    renderWithProviders(await OrgDashboardPage({ params: Promise.resolve({ orgSlug }) }))

describe('Org Dashboard', () => {
    it('titles the data partner card, drops the welcome text and offers no New study', async () => {
        const { org } = await mockSessionWithTestData({ orgType: 'enclave' })

        await renderDashboard(org.slug)

        expect(await screen.findByText('Studies for review')).toBeDefined()
        expect(screen.queryByText(/Welcome to the/i)).toBeNull()
        expect(screen.queryByTestId('new-study')).toBeNull()
    })

    it('offers New study on a research lab dashboard', async () => {
        const { org } = await mockSessionWithTestData({ orgType: 'lab' })

        await renderDashboard(org.slug)

        await screen.findByText(/Every study follows four steps/)
        expect(screen.getByTestId('new-study')).toHaveTextContent('New study')
    })

    // The route org, not the viewer's current one: this session is on its lab while the page is asked
    // for its data partner's dashboard (OTTER-619).
    it('heads the page with the route org above "Dashboard", once', async () => {
        const routeOrg = await insertTestOrg({
            slug: faker.string.alpha(10),
            name: 'Mars University Lab',
            type: 'enclave',
        })
        await mockDualRoleSessionWithTestData({ enclaveSlug: routeOrg.slug })

        await renderDashboard(routeOrg.slug)

        expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
        expect(pageHeaderEyebrow()).toBe('Mars University Lab')
        expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    })
})
