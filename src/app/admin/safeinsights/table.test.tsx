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
    userEvent,
    waitFor,
} from '@/tests/unit.helpers'
import { OrgsAdminTable } from './table'

describe('OrgsAdminTable', () => {
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
                    message: expect.stringContaining('has studies or legal documents'),
                }),
            )
        })
        expect(screen.getByText(org.name)).toBeInTheDocument()
    })
})
