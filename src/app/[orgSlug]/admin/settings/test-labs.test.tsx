import {
    db,
    describe,
    expect,
    faker,
    insertTestOrg,
    it,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    userEvent,
    waitFor,
} from '@/tests/unit.helpers'
import { within } from '@testing-library/react'
import { TestLabs } from './test-labs'

const renderForDataPartner = async () => {
    const slug = faker.string.alpha(10)
    const { org } = await mockSessionWithTestData({ orgSlug: slug, orgType: 'enclave', isAdmin: true })
    renderWithProviders(<TestLabs isVisible />)

    return org
}

describe('TestLabs', () => {
    it('renders the section with its empty state', async () => {
        await renderForDataPartner()

        await waitFor(() => {
            expect(screen.getByRole('heading', { name: /Test Labs/i })).toBeInTheDocument()
            expect(screen.getByText(/No test labs have been added/i)).toBeInTheDocument()
        })
    })

    it('renders nothing for a research lab', async () => {
        const slug = faker.string.alpha(10)
        await mockSessionWithTestData({ orgSlug: slug, orgType: 'lab', isAdmin: true })

        renderWithProviders(<TestLabs isVisible={false} />)

        expect(screen.queryByRole('heading', { name: /Test Labs/i })).toBeNull()
    })

    it('lists a designated lab', async () => {
        const org = await renderForDataPartner()
        const lab = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        await db.insertInto('orgTestLab').values({ dataPartnerId: org.id, researchLabId: lab.id }).execute()

        renderWithProviders(<TestLabs isVisible />)

        await waitFor(() => expect(screen.getAllByText(lab.name).length).toBeGreaterThan(0))
    })

    it('designates a lab through the picker, which confirms first', async () => {
        const org = await renderForDataPartner()
        const lab = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })

        await userEvent.click(screen.getByRole('button', { name: 'Add' }))
        await waitFor(() => expect(screen.getByRole('checkbox', { name: lab.name })).toBeInTheDocument())
        await userEvent.click(screen.getByRole('checkbox', { name: lab.name }))

        const dialog = screen.getByRole('dialog')
        await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }))

        await waitFor(() => expect(within(dialog).getByRole('heading', { name: /Add these labs as Test Labs\?/i })).toBeInTheDocument())
        await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }))

        // The modal closes in the mutation's onSuccess, so this waits for it to settle rather than
        // polling the row it wrote.
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
        await waitFor(() => expect(screen.getByText(lab.name)).toBeInTheDocument())

        const rows = await db
            .selectFrom('orgTestLab')
            .select('researchLabId')
            .where('dataPartnerId', '=', org.id)
            .execute()
        expect(rows.map((row) => row.researchLabId)).toEqual([lab.id])
    })

    // The picker's state lives above AppModal, so a successful add used to leave it on the
    // confirmation step with the last selection still made.
    it('reopens on the picker, not the confirmation, after a successful add', async () => {
        await renderForDataPartner()
        const lab = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        const other = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })

        await userEvent.click(screen.getByRole('button', { name: 'Add' }))
        await waitFor(() => expect(screen.getByRole('checkbox', { name: lab.name })).toBeInTheDocument())
        await userEvent.click(screen.getByRole('checkbox', { name: lab.name }))

        const dialog = screen.getByRole('dialog')
        await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }))
        await waitFor(() => expect(within(dialog).getByRole('heading', { name: /Add these labs as Test Labs\?/i })).toBeInTheDocument())
        await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }))
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

        await userEvent.click(screen.getByRole('button', { name: 'Add' }))

        await waitFor(() => expect(screen.getByLabelText('Search research labs')).toHaveValue(''))
        expect(screen.getByRole('checkbox', { name: other.name })).not.toBeChecked()
    })

    it('filters the picker by the search box', async () => {
        await renderForDataPartner()
        const wanted = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab', name: 'Cosmology Lab' })
        const other = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab', name: 'Botany Lab' })

        await userEvent.click(screen.getByRole('button', { name: 'Add' }))
        await waitFor(() => expect(screen.getByRole('checkbox', { name: wanted.name })).toBeInTheDocument())

        await userEvent.type(screen.getByLabelText('Search research labs'), 'cosmo')

        await waitFor(() => {
            expect(screen.getByRole('checkbox', { name: wanted.name })).toBeInTheDocument()
            expect(screen.queryByRole('checkbox', { name: other.name })).toBeNull()
        })
    })
})
