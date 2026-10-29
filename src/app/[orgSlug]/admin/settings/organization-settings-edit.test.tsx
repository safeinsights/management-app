import { describe, expect, faker, it, renderWithProviders, screen, userEvent } from '@/tests/unit.helpers'
import { type PublicOrg } from '@/schema/org'
import { OrganizationSettingsEdit } from './organization-settings-edit'

// Two code units, one character: `.length` would read double.
const NFD_E_ACUTE = 'é'

const org: PublicOrg = {
    id: faker.string.uuid(),
    slug: faker.string.alpha(10),
    name: 'Test Org',
    type: 'lab',
    description: 'Hello',
}

function renderForm() {
    renderWithProviders(<OrganizationSettingsEdit org={org} onSaveSuccess={() => {}} onCancel={() => {}} />)
    return userEvent.setup()
}

async function replaceValue(user: ReturnType<typeof userEvent.setup>, label: string, value: string) {
    const input = screen.getByLabelText(label)
    await user.clear(input)
    await user.click(input)
    await user.paste(value)
    return input
}

const describedBy = (input: HTMLElement) =>
    (input.getAttribute('aria-describedby') ?? '').split(' ').map((id) => document.getElementById(id))

// The error carries the design icon; the counter does not.
const describedError = (input: HTMLElement) => describedBy(input).find((el) => el?.querySelector('svg'))

describe('OrganizationSettingsEdit character counters', () => {
    it('hides the name counter while the name has no error', () => {
        renderForm()

        expect(screen.queryByText(/\/50 characters/)).not.toBeInTheDocument()
    })

    it('shows the name counter once, outside the error, when the name is over the limit', async () => {
        const user = renderForm()
        const input = await replaceValue(user, 'Name', 'a'.repeat(51))

        const counters = await screen.findAllByText('51/50 characters')
        expect(counters).toHaveLength(1)
        expect(screen.getAllByText('Name cannot exceed 50 characters')).toHaveLength(1)
        expect(describedError(input)?.textContent).toBe('Name cannot exceed 50 characters')
        expect(describedBy(input)).toContain(counters[0])
    })

    it('always shows the description counter once', () => {
        renderForm()

        expect(screen.getAllByText('5/250 characters')).toHaveLength(1)
    })

    it('keeps one description counter, outside the error, when the description is over the limit', async () => {
        const user = renderForm()
        const input = await replaceValue(user, 'Description', 'a'.repeat(251))

        expect(await screen.findAllByText('251/250 characters')).toHaveLength(1)
        expect(screen.getAllByText('Description cannot exceed 250 characters')).toHaveLength(1)
        expect(describedError(input)?.textContent).toBe('Description cannot exceed 250 characters')
    })

    it('counts trimmed characters, not code units', async () => {
        const user = renderForm()
        await replaceValue(user, 'Description', `  caf${NFD_E_ACUTE}  `)

        expect(await screen.findByText('4/250 characters')).toBeInTheDocument()
    })

    it('accepts a name at the limit when counted in characters, and rejects one over it', async () => {
        const user = renderForm()
        await replaceValue(user, 'Name', NFD_E_ACUTE.repeat(50))

        expect(screen.queryByText('Name cannot exceed 50 characters')).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()

        await user.paste(NFD_E_ACUTE)

        expect(await screen.findByText('Name cannot exceed 50 characters')).toBeInTheDocument()
        expect(screen.getByText('51/50 characters')).toBeInTheDocument()
    })

    it('treats a whitespace-only name as missing', async () => {
        const user = renderForm()
        await replaceValue(user, 'Name', '   ')

        expect(await screen.findAllByText('Name is required')).toHaveLength(1)
        expect(screen.getByText('0/50 characters')).toBeInTheDocument()
    })
})
