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

const labPicker = () => screen.getByRole('textbox', { name: 'Research Labs' })
const continueButton = () => within(screen.getByRole('dialog')).getByRole('button', { name: 'Add as Test Lab' })

const openPicker = async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Add Test Lab' }))
    // Disabled while the eligible labs load; a click before then silently does nothing.
    await waitFor(() => expect(labPicker()).toBeEnabled())
}

// By text, not by role: this environment renders Mantine's dropdown outside the accessibility tree.
const pickLab = async (name: string) => {
    await userEvent.click(labPicker())
    await userEvent.click(await screen.findByText(name))
}

const designateThroughModal = async (name: string) => {
    await openPicker()
    await pickLab(name)
    await userEvent.click(continueButton())
    await waitFor(() =>
        expect(screen.getByRole('heading', { name: /Add these labs as Test Labs\?/i })).toBeInTheDocument(),
    )
    await userEvent.click(continueButton())
    // Waits for onSuccess to close the modal rather than polling the row it wrote.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
}

const uniqueLabName = (prefix: string) => `${prefix} ${faker.string.alpha(8)}`

describe('TestLabs', () => {
    it('renders the section with its empty state and no table', async () => {
        await renderForDataPartner()

        await waitFor(() => {
            expect(screen.getByRole('heading', { name: 'Test Labs' })).toBeInTheDocument()
            expect(screen.getByText('No Test Labs added yet')).toBeInTheDocument()
        })
        expect(screen.queryByRole('table')).toBeNull()
    })

    it('renders nothing for a research lab', async () => {
        const slug = faker.string.alpha(10)
        await mockSessionWithTestData({ orgSlug: slug, orgType: 'lab', isAdmin: true })

        renderWithProviders(<TestLabs isVisible={false} />)

        expect(screen.queryByRole('heading', { name: /Test Labs/i })).toBeNull()
    })

    it('lists a designated lab with the date it was added', async () => {
        const org = await renderForDataPartner()
        const lab = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        await db
            .insertInto('orgTestLab')
            .values({ dataPartnerId: org.id, researchLabId: lab.id, createdAt: new Date('2026-09-14T15:00:00Z') })
            .execute()

        renderWithProviders(<TestLabs isVisible />)

        const row = await screen.findByRole('row', { name: new RegExp(lab.name) })
        expect(within(row).getByText('Sep 14, 2026')).toBeInTheDocument()
        expect(screen.getByRole('columnheader', { name: 'Added on' })).toBeInTheDocument()
    })

    it('designates a lab through the picker, which confirms first', async () => {
        const org = await renderForDataPartner()
        const lab = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab', name: uniqueLabName('Picked') })

        await designateThroughModal(lab.name)

        await screen.findByRole('row', { name: new RegExp(lab.name) })
        const rows = await db
            .selectFrom('orgTestLab')
            .select('researchLabId')
            .where('dataPartnerId', '=', org.id)
            .execute()
        expect(rows.map((row) => row.researchLabId)).toEqual([lab.id])
    })

    it('explains, and refuses, continuing with nothing selected', async () => {
        await renderForDataPartner()
        await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        await openPicker()

        const button = continueButton()
        expect(button).toHaveAttribute('aria-disabled', 'true')
        expect(button).toHaveAccessibleDescription('Select at least one Research Lab to continue')

        await userEvent.click(button)

        expect(screen.queryByRole('heading', { name: /Add these labs as Test Labs\?/i })).toBeNull()
    })

    it('shows the disabled reason as a tooltip on focus', async () => {
        await renderForDataPartner()
        await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        await openPicker()

        continueButton().focus()

        expect(await screen.findByRole('tooltip')).toHaveTextContent('Select at least one Research Lab to continue')
    })

    // A close from the mutation, not Cancel, used to carry the step and selection into the next open.
    it('reopens on an empty picker, not the confirmation, after a successful add', async () => {
        await renderForDataPartner()
        const lab = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab', name: uniqueLabName('First') })
        await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })

        await designateThroughModal(lab.name)
        await openPicker()

        expect(continueButton()).toHaveAttribute('aria-disabled', 'true')
        expect(labPicker()).toHaveAttribute('placeholder', 'Select one or more Research Labs')
    })

    it('filters the picker by typing into it', async () => {
        await renderForDataPartner()
        const wanted = await insertTestOrg({
            slug: faker.string.alpha(10),
            type: 'lab',
            name: uniqueLabName('Cosmology'),
        })
        const other = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab', name: uniqueLabName('Botany') })
        await openPicker()

        await userEvent.type(labPicker(), wanted.name)

        await waitFor(() => {
            expect(screen.getByText(wanted.name)).toBeInTheDocument()
            expect(screen.queryByText(other.name)).toBeNull()
        })
    })

    it('says nothing was found when the search matches no lab', async () => {
        await renderForDataPartner()
        await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        await openPicker()

        await userEvent.type(labPicker(), faker.string.alpha(24))

        expect(await screen.findByText('Nothing found')).toBeInTheDocument()
    })
})
