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
import { db } from '@/database'
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
        triggerScanForCodeEnv: vi.fn().mockResolvedValue(undefined),
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

    it('opens the modal and creates a code environment that is displayed in table', { timeout: 15000 }, async () => {
        renderWithProviders(<CodeEnvs />)

        const addButton = screen.getByRole('button', { name: /Add Code Environment/i })
        fireEvent.click(addButton)

        await waitFor(() => {
            expect(screen.getByRole('heading', { name: /Add Code Environment/i })).toBeInTheDocument()
        })

        const envName = faker.hacker.noun() + ' Code Env'
        await userEvent.type(screen.getByLabelText(/Name/i), envName)
        await userEvent.type(screen.getByLabelText(/Identifier/i), 'test_env')
        await userEvent.type(screen.getByPlaceholderText(/harbor\.safeinsights/i), 'example.com/test-image:tag-1234')

        // Upload a starter code file via the dropzone input
        const file = new File(['print("Hello World")'], 'starter.R', { type: 'text/plain' })
        const fileInputs = document.querySelectorAll('input[type="file"]')
        const fileInput = fileInputs[0] as HTMLInputElement
        await userEvent.upload(fileInput, file)

        // Add a command line entry
        await userEvent.type(screen.getByPlaceholderText(/Extension/i), 'r')
        await userEvent.type(screen.getByPlaceholderText(/Command/i), 'Rscript %f')
        await userEvent.click(screen.getByRole('button', { name: /Add command line/i }))

        await userEvent.click(screen.getByRole('button', { name: /Save Code Environment/i }))

        await waitFor(() => {
            expect(screen.getByText(envName)).toBeInTheDocument()
        })
    })

    it('surfaces malformed env var errors in the summary above submit', { timeout: 15000 }, async () => {
        renderWithProviders(<CodeEnvs />)

        fireEvent.click(screen.getByRole('button', { name: /Add Code Environment/i }))

        await waitFor(() => {
            expect(screen.getByRole('heading', { name: /Add Code Environment/i })).toBeInTheDocument()
        })

        // Add an env var whose name is invalid (starts with a digit) into the list
        await userEvent.type(screen.getByPlaceholderText(/Variable name/i), '1BAD')
        await userEvent.type(screen.getByPlaceholderText(/^Value$/i), 'something')
        await userEvent.click(screen.getByRole('button', { name: /Add environment variable/i }))

        await userEvent.click(screen.getByRole('button', { name: /Save Code Environment/i }))

        await waitFor(() => {
            expect(screen.getByText(/Please fix the following before saving/i)).toBeInTheDocument()
            expect(screen.getByText(/Invalid variable name/i)).toBeInTheDocument()
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

        expect(screen.queryByRole('button', { name: 'Delete Only Image' })).not.toBeInTheDocument()
    })

    it('hides delete on the last non-testing environment for a language even when other envs exist', async () => {
        await insertTestCodeEnv({
            orgId: org.id,
            name: 'Prod R',
            language: 'R',
            isTesting: false,
        })

        await insertTestCodeEnv({
            orgId: org.id,
            name: 'Test R',
            language: 'R',
            isTesting: true,
        })

        renderWithProviders(<CodeEnvs />)

        await waitFor(() => {
            expect(screen.getByText('Prod R')).toBeInTheDocument()
            expect(screen.getByText('Test R')).toBeInTheDocument()
        })

        expect(screen.queryByRole('button', { name: 'Delete Prod R' })).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Delete Test R' })).toBeInTheDocument()
    })

    it('shows delete when multiple non-testing environments exist for a language', async () => {
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

        expect(screen.getByRole('button', { name: 'Delete R Image 1' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Delete R Image 2' })).toBeInTheDocument()
    })

    it('hides delete on the only environment that passed scanning', async () => {
        const passed = await insertTestCodeEnv({
            orgId: org.id,
            name: 'Passed R',
            language: 'R',
            isTesting: false,
        })

        const failed = await insertTestCodeEnv({
            orgId: org.id,
            name: 'Failed R',
            language: 'R',
            isTesting: false,
        })

        await db.insertInto('codeScan').values({ codeEnvId: passed.id, status: 'SCAN-COMPLETE' }).execute()
        await db.insertInto('codeScan').values({ codeEnvId: failed.id, status: 'SCAN-FAILED' }).execute()

        renderWithProviders(<CodeEnvs />)

        await waitFor(() => {
            expect(screen.getByText('Passed R')).toBeInTheDocument()
            expect(screen.getByText('Failed R')).toBeInTheDocument()
        })

        expect(screen.queryByRole('button', { name: 'Delete Passed R' })).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Delete Failed R' })).toBeInTheDocument()
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
