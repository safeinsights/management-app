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

vi.mock('@/hooks/upload', () => ({
    uploadFiles: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/server/aws', async () => {
    const actual = await vi.importActual('@/server/aws')
    return {
        ...actual,
        storeS3File: vi.fn().mockResolvedValue(undefined),
        deleteS3File: vi.fn().mockResolvedValue(undefined),
        deleteFolderContents: vi.fn().mockResolvedValue(undefined),
        createSignedUploadUrl: vi.fn().mockResolvedValue({ url: 'https://s3.example.com', fields: { key: 'test' } }),
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

    it('hides delete when there is only one code environment', async () => {
        await insertTestCodeEnv({
            orgId: org.id,
            name: 'Only Image',
            language: 'R',
            isTesting: false,
        })

        renderWithProviders(<CodeEnvs />)

        await waitFor(() => {
            expect(screen.getByText('Only Image')).toBeInTheDocument()
        })

        const trashButtons = screen.getAllByRole('button', { name: '' }).filter((btn) => btn.querySelector('svg'))
        const hasSuretyGuard = trashButtons.some((btn) => btn.closest('[data-variant="filled"]'))
        expect(hasSuretyGuard).toBe(false)
    })

    it('shows delete on all rows when there are multiple code environments', async () => {
        await insertTestCodeEnv({
            orgId: org.id,
            name: 'R Image',
            language: 'R',
            isTesting: false,
        })

        await insertTestCodeEnv({
            orgId: org.id,
            name: 'Python Image',
            language: 'PYTHON',
            isTesting: true,
        })

        renderWithProviders(<CodeEnvs />)

        await waitFor(() => {
            expect(screen.getByText('R Image')).toBeInTheDocument()
            expect(screen.getByText('Python Image')).toBeInTheDocument()
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

        expect(screen.getAllByText('Env Vars').length).toBeGreaterThanOrEqual(1)
        expect(screen.getByText('VAR1=value1')).toBeInTheDocument()
        expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(1)
    })
})
