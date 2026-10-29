import {
    renderWithProviders,
    faker,
    db,
    describe,
    expect,
    fireEvent,
    insertTestOrg,
    it,
    mockSessionWithTestData,
    screen,
    userEvent,
    vi,
    waitFor,
} from '@/tests/unit.helpers'
import { useTanStackQuery, type FC } from '@/common'
import { EditOrgForm } from './edit-org-form'

const OrgsListObserver: FC<{ queryFn: () => Promise<unknown[]> }> = ({ queryFn }) => {
    useTanStackQuery({ queryKey: ['orgs'], queryFn, initialData: [] })
    return null
}

const mockOrg = {
    id: '1',
    slug: 'test',
    email: faker.internet.email(),
    name: 'test',
    type: 'enclave' as const,
    settings: { publicKey: 'junk' },
    totalUsers: 0,
    totalStudies: 0,
    totalCodeEnvs: 0,
    totalDataSources: 0,
}

describe('EditOrgForm', () => {
    it('renders form fields correctly', () => {
        renderWithProviders(<EditOrgForm org={mockOrg} />)
        const slugInput = screen.getByPlaceholderText('Enter slug')
        expect(slugInput).toBeDefined()
    })

    it('disables the slug field if org has an id', () => {
        renderWithProviders(<EditOrgForm org={{ ...mockOrg, id: '123' }} />)
        const slugInput = screen.getByPlaceholderText('Enter slug')
        expect(slugInput).toHaveProperty('disabled')
    })

    it('populates form fields with org data', () => {
        renderWithProviders(<EditOrgForm org={mockOrg} />)

        const slugInput = screen.getByPlaceholderText('Enter slug') as HTMLInputElement
        expect(slugInput.value).toBe(mockOrg.slug)

        const inputs = screen.getAllByRole('textbox') as HTMLInputElement[]
        const [, nameInput, emailInput] = inputs

        const publicKeyTextarea = screen.getByPlaceholderText('Enter your public key') as HTMLTextAreaElement

        const typeSelect = screen.getByDisplayValue('Enclave (Data Partner)')

        expect(nameInput.value).toBe(mockOrg.name)
        expect(emailInput.value).toBe(mockOrg.email)
        expect(publicKeyTextarea.value).toBe((mockOrg.settings as { publicKey: string }).publicKey)
        expect(typeSelect).toBeDefined()
    })

    it('allows updating form fields', () => {
        renderWithProviders(<EditOrgForm org={mockOrg} />)

        const inputs = screen.getAllByRole('textbox') as HTMLInputElement[]
        const [slugInput, nameInput, emailInput] = inputs

        const publicKeyTextarea = screen.getByPlaceholderText('Enter your public key') as HTMLTextAreaElement

        fireEvent.change(slugInput, { target: { value: 'new-slug' } })
        fireEvent.change(nameInput, { target: { value: 'New Name' } })
        fireEvent.change(emailInput, { target: { value: 'new@example.com' } })
        fireEvent.change(publicKeyTextarea, { target: { value: 'new-key' } })

        expect(slugInput.value).toBe('new-slug')
        expect(nameInput.value).toBe('New Name')
        expect(emailInput.value).toBe('new@example.com')
        expect(publicKeyTextarea.value).toBe('new-key')
    })

    it('completes before the organizations list finishes refetching', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const org = await insertTestOrg({ slug: `edit-org-${faker.string.uuid()}`, type: 'lab' })
        let finishRefetch = () => {}
        const refetchOrgs = vi.fn(
            () =>
                new Promise<unknown[]>((resolve) => {
                    finishRefetch = () => resolve([])
                }),
        )
        const onComplete = vi.fn()

        renderWithProviders(
            <>
                <OrgsListObserver queryFn={refetchOrgs} />
                <EditOrgForm
                    org={{
                        id: org.id,
                        slug: org.slug,
                        name: org.name,
                        email: org.email,
                        type: org.type,
                        settings: org.settings,
                        totalUsers: 0,
                        totalStudies: 0,
                        totalCodeEnvs: 0,
                        totalDataSources: 0,
                    }}
                    onCompleteAction={onComplete}
                />
            </>,
        )

        const nameInput = screen.getByPlaceholderText('Enter your name')
        await userEvent.clear(nameInput)
        await userEvent.type(nameInput, 'Renamed Org')
        await userEvent.click(screen.getByRole('button', { name: 'Submit' }))

        await waitFor(() => expect(refetchOrgs).toHaveBeenCalledOnce())
        expect(onComplete).toHaveBeenCalledOnce()
        finishRefetch()

        const saved = await db.selectFrom('org').select('name').where('id', '=', org.id).executeTakeFirstOrThrow()
        expect(saved.name).toBe('Renamed Org')
    })
})
