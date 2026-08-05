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

    // OTTER-647: a malformed variable name is now rejected on the field the admin typed into
    // when they click "+", instead of being accepted into the list and only surfacing later in
    // the generic summary above Save, where nothing said which row was at fault.
    it('rejects a malformed env var name on the field itself', { timeout: 15000 }, async () => {
        renderWithProviders(<CodeEnvs />)

        fireEvent.click(screen.getByRole('button', { name: /Add Code Environment/i }))

        await waitFor(() => {
            expect(screen.getByRole('heading', { name: /Add Code Environment/i })).toBeInTheDocument()
        })

        // A name starting with a digit is invalid per envVarKeyRegex.
        await userEvent.type(screen.getByPlaceholderText(/Variable name/i), '1BAD')
        await userEvent.type(screen.getByPlaceholderText(/^Value$/i), 'something')
        await userEvent.click(screen.getByRole('button', { name: /Add environment variable/i }))

        // Rendered both inline on the field and in the summary above Save.
        expect((await screen.findAllByText(/Invalid variable name/i)).length).toBeGreaterThan(0)
        const nameInput = screen.getByPlaceholderText(/Variable name/i)
        expect(nameInput).toHaveAttribute('aria-invalid', 'true')
        // The row was not added, so the draft value is still in the input.
        expect(nameInput).toHaveValue('1BAD')
    })

    // OTTER-647: the form seeded starterCodes as undefined, so the create schema's array type
    // check failed before `.min(1)` could run and Save surfaced Zod's internal
    // "expected array, received undefined" instead of naming the requirement.
    it('names the starter code requirement in plain language', async () => {
        renderWithProviders(<CodeEnvs />)

        fireEvent.click(screen.getByRole('button', { name: /Add Code Environment/i }))
        await waitFor(() => {
            expect(screen.getByRole('heading', { name: /Add Code Environment/i })).toBeInTheDocument()
        })

        await userEvent.click(screen.getByRole('button', { name: /Save Code Environment/i }))

        expect((await screen.findAllByText(/At least one starter code file is required/i)).length).toBeGreaterThan(0)
        expect(screen.queryByText(/expected array/i)).not.toBeInTheDocument()
    })

    it('flags the starter code dropzone once it has been visited and left empty', async () => {
        renderWithProviders(<CodeEnvs />)

        fireEvent.click(screen.getByRole('button', { name: /Add Code Environment/i }))
        await waitFor(() => {
            expect(screen.getByRole('heading', { name: /Add Code Environment/i })).toBeInTheDocument()
        })

        expect(screen.queryByText(/At least one starter code file is required/i)).not.toBeInTheDocument()

        // The dropzone has no input to blur, so "left incomplete" is visited-then-left-empty.
        fireEvent.blur(screen.getByTestId('starter-code-dropzone'))

        expect(await screen.findByText(/At least one starter code file is required/i)).toBeInTheDocument()
    })

    // The `[]` seeding above is what lets the create schema report its own requirement, but it
    // also reaches the edit path, where the file list is optional and an empty one would read as
    // "the admin cleared the starter code" rather than "left the existing files alone".
    it('saves an edit with an untouched dropzone and keeps the existing starter code', async () => {
        const codeEnv = await insertTestCodeEnv({
            orgId: org.id,
            name: 'Editable Env',
            language: 'R',
            starterCodeFileNames: ['existing.R'],
        })

        renderWithProviders(<CodeEnvs />)
        await waitFor(() => expect(screen.getByText('Editable Env')).toBeInTheDocument())

        fireEvent.click(screen.getByRole('button', { name: /edit editable env/i }))
        await waitFor(() => {
            expect(screen.getByRole('heading', { name: /Edit Code Environment/i })).toBeInTheDocument()
        })

        const nameInput = screen.getByLabelText(/Name/i)
        await userEvent.clear(nameInput)
        await userEvent.type(nameInput, 'Renamed Env')
        await userEvent.click(screen.getByRole('button', { name: /Update Code Environment/i }))

        await waitFor(() => expect(screen.getByText('Renamed Env')).toBeInTheDocument())

        const saved = await db
            .selectFrom('orgCodeEnv')
            .select(['name', 'starterCodeFileNames'])
            .where('id', '=', codeEnv.id)
            .executeTakeFirstOrThrow()

        expect(saved.name).toBe('Renamed Env')
        expect(saved.starterCodeFileNames).toEqual(['existing.R'])
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

    describe('change history', () => {
        it('shows recorded changes when the history icon is clicked', async () => {
            const codeEnv = await insertTestCodeEnv({ orgId: org.id, name: 'Audited Env', language: 'R' })
            const { user } = await mockSessionWithTestData({ isAdmin: true, orgSlug: org.slug })

            await db
                .insertInto('audit')
                .values({
                    userId: user.id,
                    eventType: 'UPDATED',
                    recordType: 'CODE_ENV',
                    recordId: codeEnv.id,
                    metadata: { changes: [{ field: 'url', before: 'repo/img:v1', after: 'repo/img:v2' }] },
                })
                .execute()

            renderWithProviders(<CodeEnvs />)
            await waitFor(() => expect(screen.getByText('Audited Env')).toBeInTheDocument())

            fireEvent.click(screen.getByRole('button', { name: /history for audited env/i }))

            await waitFor(() => {
                expect(screen.getByRole('dialog')).toBeInTheDocument()
            })
            expect(await screen.findByText(/repo\/img:v1/)).toBeInTheDocument()
            expect(screen.getByText(/repo\/img:v2/)).toBeInTheDocument()
        })

        it('shows an empty state when nothing has been recorded', async () => {
            await insertTestCodeEnv({ orgId: org.id, name: 'Untouched Env', language: 'R' })

            renderWithProviders(<CodeEnvs />)
            await waitFor(() => expect(screen.getByText('Untouched Env')).toBeInTheDocument())

            fireEvent.click(screen.getByRole('button', { name: /history for untouched env/i }))

            expect(await screen.findByText(/no changes have been recorded/i)).toBeInTheDocument()
        })
    })
})
