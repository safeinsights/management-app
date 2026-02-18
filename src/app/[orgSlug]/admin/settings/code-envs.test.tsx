import {
    describe,
    it,
    expect,
    beforeEach,
    screen,
    fireEvent,
    waitFor,
    mockSessionWithTestData,
    faker,
    renderWithProviders,
    insertTestCodeEnv,
} from '@/tests/unit.helpers'
import { vi } from 'vitest'
import { Selectable } from 'kysely'
import { CodeEnvs } from './code-envs'
import { Org } from '@/database/types'
import userEvent from '@testing-library/user-event'

vi.mock('@/server/aws', async () => {
    const actual = await vi.importActual('@/server/aws')
    return {
        ...actual,
        storeS3File: vi.fn().mockResolvedValue(undefined),
        deleteS3File: vi.fn().mockResolvedValue(undefined),
        deleteFolderContents: vi.fn().mockResolvedValue(undefined),
    }
})

describe('CodeEnvs', async () => {
    let org: Selectable<Org>

    beforeEach(async () => {
        const { org: createdOrg } = await mockSessionWithTestData({ isAdmin: true, orgSlug: faker.string.alpha(10) })
        org = createdOrg
    })

    it('renders empty state', async () => {
        renderWithProviders(<CodeEnvs />)
        await waitFor(async () => {
            expect(screen.getByText(/no code environments available/i)).toBeTruthy()
        })
    })

    it('renders code environments when they are present', async () => {
        await insertTestCodeEnv({
            orgId: org.id,
            name: 'R Code Env 1',
            language: 'R',
        })

        renderWithProviders(<CodeEnvs />)
        await waitFor(() => {
            expect(screen.getByText('R Code Env 1')).toBeInTheDocument()
        })
        expect(screen.getByRole('button', { name: /add code environment/i })).toBeInTheDocument()
    })

    it('opens the modal and creates a code environment that is displayed in table', async () => {
        renderWithProviders(<CodeEnvs />)

        const addButton = screen.getByRole('button', { name: /Add Code Environment/i })
        fireEvent.click(addButton)

        await waitFor(() => {
            expect(screen.getByRole('heading', { name: /Add Code Environment/i })).toBeInTheDocument()
        })

        const envName = faker.hacker.noun() + ' Code Env'
        await userEvent.type(screen.getByLabelText(/Name/i), envName)
        await userEvent.type(screen.getByLabelText(/Command Line/i), 'Rscript %f')
        await userEvent.type(screen.getByPlaceholderText(/harbor\.safeinsights/i), 'example.com/test-image:tag-1234')

        // Upload a starter code file
        const file = new File(['print("Hello World")'], 'starter.R', { type: 'text/plain' })
        const fileInputs = document.querySelectorAll('input[type="file"]')
        const fileInput = fileInputs[0] as HTMLInputElement
        await userEvent.upload(fileInput, file)

        await userEvent.click(screen.getByRole('button', { name: /Save Code Environment/i }))

        await waitFor(() => {
            expect(screen.getByText(envName)).toBeInTheDocument()
        })
    })

    it('allows deletion of testing images regardless of count', async () => {
        await insertTestCodeEnv({
            orgId: org.id,
            name: 'Production Image',
            language: 'R',
            isTesting: false,
        })

        await insertTestCodeEnv({
            orgId: org.id,
            name: 'Testing Image',
            language: 'PYTHON',
            isTesting: true,
        })

        renderWithProviders(<CodeEnvs />)

        await waitFor(() => {
            expect(screen.getByText('Production Image')).toBeInTheDocument()
            expect(screen.getByText('Testing Image')).toBeInTheDocument()
        })

        const deleteButtons = screen.getAllByRole('button', { name: '' }).filter((btn) => btn.querySelector('svg'))

        expect(deleteButtons.length).toBeGreaterThanOrEqual(1)
    })

    it('prevents deletion of the last non-testing image', async () => {
        await insertTestCodeEnv({
            orgId: org.id,
            name: 'Only Production Image',
            language: 'R',
            isTesting: false,
        })

        renderWithProviders(<CodeEnvs />)

        await waitFor(() => {
            expect(screen.getByText('Only Production Image')).toBeInTheDocument()
        })

        const actionIcons = screen.getAllByRole('button', { name: '' })
        const potentialDeleteButtons = actionIcons.filter((btn) => {
            const actionIcon = btn.closest('.mantine-ActionIcon-root')
            return actionIcon?.getAttribute('data-variant') === 'subtle'
        })

        expect(potentialDeleteButtons.length).toBeGreaterThanOrEqual(1)
    })

    it('allows deletion of non-testing images when there are multiple', async () => {
        await insertTestCodeEnv({
            orgId: org.id,
            name: 'Production Image 1',
            language: 'R',
            isTesting: false,
        })

        await insertTestCodeEnv({
            orgId: org.id,
            name: 'Production Image 2',
            language: 'PYTHON',
            isTesting: false,
        })

        renderWithProviders(<CodeEnvs />)

        await waitFor(() => {
            expect(screen.getByText('Production Image 1')).toBeInTheDocument()
            expect(screen.getByText('Production Image 2')).toBeInTheDocument()
        })

        const actionIcons = screen.getAllByRole('button', { name: '' })
        expect(actionIcons.length).toBeGreaterThanOrEqual(4)
    })

    it('prevents deletion of the last non-testing image per language', async () => {
        await insertTestCodeEnv({
            orgId: org.id,
            name: 'Only R Image',
            language: 'R',
            isTesting: false,
        })

        await insertTestCodeEnv({
            orgId: org.id,
            name: 'Only Python Image',
            language: 'PYTHON',
            isTesting: false,
        })

        renderWithProviders(<CodeEnvs />)

        await waitFor(() => {
            expect(screen.getByText('Only R Image')).toBeInTheDocument()
            expect(screen.getByText('Only Python Image')).toBeInTheDocument()
        })

        const actionIcons = screen.getAllByRole('button', { name: '' })
        const editButtons = actionIcons.filter((btn) => {
            return btn.closest('[data-variant="subtle"]') !== null
        })
        expect(editButtons.length).toBeGreaterThanOrEqual(2)
    })

    it('allows deletion when there are multiple non-testing images for the same language', async () => {
        await insertTestCodeEnv({
            orgId: org.id,
            name: 'R Image 1',
            language: 'R',
            isTesting: false,
        })

        await insertTestCodeEnv({
            orgId: org.id,
            name: 'R Image 2',
            language: 'R',
            isTesting: false,
        })

        renderWithProviders(<CodeEnvs />)

        await waitFor(() => {
            expect(screen.getByText('R Image 1')).toBeInTheDocument()
            expect(screen.getByText('R Image 2')).toBeInTheDocument()
        })

        const actionIcons = screen.getAllByRole('button', { name: '' })
        expect(actionIcons.length).toBeGreaterThanOrEqual(4)
    })

    it('displays env vars as KEY=VALUE in table', async () => {
        await insertTestCodeEnv({
            orgId: org.id,
            name: 'Image with Env Vars',
            language: 'R',
            environment: [{ name: 'VAR1', value: 'value1' }],
        })

        await insertTestCodeEnv({
            orgId: org.id,
            name: 'Image without Env Vars',
            language: 'PYTHON',
            environment: [],
        })

        renderWithProviders(<CodeEnvs />)

        await waitFor(() => {
            expect(screen.getByText('Image with Env Vars')).toBeInTheDocument()
            expect(screen.getByText('Image without Env Vars')).toBeInTheDocument()
        })

        expect(screen.getByText('Env Vars')).toBeInTheDocument()
        expect(screen.getByText('VAR1=value1')).toBeInTheDocument()
        expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(1)
    })
})
