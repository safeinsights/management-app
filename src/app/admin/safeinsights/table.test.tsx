import { notifications } from '@mantine/notifications'
import {
    describe,
    expect,
    faker,
    insertTestOrg,
    insertTestStudyOnly,
    it,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    tableHeader,
    userEvent,
    waitFor,
    within,
} from '@/tests/unit.helpers'
import { OrgsAdminTable } from './table'

describe('OrgsAdminTable', () => {
    it('marks its sortable columns with the shared dark carets', async () => {
        const org = await insertTestOrg({ slug: faker.string.alpha(10), name: `Org ${faker.string.alpha(8)}` })
        await mockSessionWithTestData({ isSiAdmin: true })

        renderWithProviders(<OrgsAdminTable />)
        await screen.findByText(org.name)

        const icons = [
            within(tableHeader('Name')).getByRole('img', { name: 'Sorted ascending' }),
            within(tableHeader('Slug')).getByRole('img', { name: 'Not sorted' }),
        ]
        for (const icon of icons) {
            const svg = icon.querySelector('svg')
            expect(svg).toHaveAttribute('viewBox', '0 0 256 256')
            expect(svg).toHaveStyle({ color: '#0d0d0d' })
        }
    })

    it('explains a refused delete in an error toast', async () => {
        const org = await insertTestOrg({ slug: faker.string.alpha(10), name: `Org ${faker.string.alpha(8)}` })
        await insertTestStudyOnly({ org })
        await mockSessionWithTestData({ isSiAdmin: true })

        renderWithProviders(<OrgsAdminTable />)
        await userEvent.click(await screen.findByRole('button', { name: `Delete ${org.name}` }))
        await userEvent.click(await screen.findByRole('button', { name: /yes/i, hidden: true }))

        await waitFor(() => {
            expect(notifications.show).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: 'Failed to delete organization',
                    message: expect.stringContaining("so it can't be deleted"),
                }),
            )
        })
        expect(screen.getByText(org.name)).toBeInTheDocument()
    })
})
