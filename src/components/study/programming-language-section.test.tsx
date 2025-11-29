import { describe, it, expect, vi, beforeEach, Mock } from 'vitest'
import { renderWithProviders, screen, faker, userEvent } from '@/tests/unit.helpers'
import { useQuery } from '@/common'
import { useSession } from '@/hooks/session'
import { UseFormReturnType } from '@mantine/form'
import { StudyProposalFormValues } from '@/app/[orgSlug]/study/request/study-proposal-form-schema'
import { ProgrammingLanguageSection } from './programming-language-section'

vi.mock('@/common', async () => {
    const actual = await vi.importActual('@/common')
    return {
        ...actual,
        useQuery: vi.fn(),
    }
})

vi.mock('@/hooks/session', () => ({
    // By default tests will configure this to return a non-admin session. Individual tests
    // can override the return value to simulate admin reviewers for the selected org.
    useSession: vi.fn(),
}))

// Helper to create a mock org with supported languages
const createMockOrg = (
    overrides: Partial<{
        slug: string
        name: string
        type: string
        supportedLanguages: Array<'R' | 'PYTHON'>
    }> = {},
) => ({
    slug: overrides.slug ?? faker.string.alpha(10),
    name: overrides.name ?? 'Test Org',
    type: overrides.type ?? 'enclave',
    supportedLanguages: overrides.supportedLanguages ?? [],
})

// Helper to create a mock form
const createMockForm = (
    overrides: Partial<{
        orgSlug: string
        language: 'R' | 'PYTHON' | null
    }> = {},
): UseFormReturnType<StudyProposalFormValues> => {
    const values = {
        orgSlug: overrides.orgSlug ?? '',
        language: overrides.language ?? null,
        title: 'Test Study',
        piName: 'Test PI',
        descriptionDocument: null,
        irbDocument: null,
        agreementDocument: null,
        mainCodeFile: null,
        additionalCodeFiles: [],
    }

    const form = {
        values,
        errors: {},
        setFieldValue: vi.fn(),
        getInputProps: vi.fn(),
        // Add minimal form methods needed
    } as unknown as UseFormReturnType<StudyProposalFormValues>

    return form
}

describe('ProgrammingLanguageSection', () => {
    const mockUseQuery = useQuery as Mock
    const mockUseSession = useSession as Mock

    beforeEach(() => {
        vi.clearAllMocks()

        // Default session for tests: loaded, but with no orgs, so getOrgBySlug() returns null
        // and isOrgAdmin() is false. This keeps the non-admin behavior as the baseline.
        mockUseSession.mockReturnValue({
            isLoaded: true,
            session: {
                user: { id: 'user-1', isSiAdmin: false, clerkUserId: 'clerk-user-1' },
                orgs: {},
            },
        })
    })

    it('shows placeholder when no org is selected', () => {
        mockUseQuery.mockReturnValue({
            data: undefined,
            isLoading: false,
        })

        const form = createMockForm({ orgSlug: '' })
        renderWithProviders(<ProgrammingLanguageSection form={form} />)

        expect(screen.getByText('Step 3 of 4')).toBeDefined()
        expect(screen.getByText('Programming language')).toBeDefined()
        expect(
            screen.getByText('Select a data organization above to see which programming languages are available.'),
        ).toBeDefined()
    })

    it('shows loading state when fetching orgs', () => {
        const orgSlug = faker.string.alpha(10)

        mockUseQuery.mockReturnValue({
            data: undefined,
            isLoading: true,
        })

        const form = createMockForm({ orgSlug })
        renderWithProviders(<ProgrammingLanguageSection form={form} />)

        expect(screen.getByText('Loading available programming languages…')).toBeDefined()
    })

    it.each([
        { language: 'R' as const, displayName: 'R' },
        { language: 'PYTHON' as const, displayName: 'Python' },
    ])('shows single language message when org supports only $displayName', ({ language, displayName }) => {
        const orgSlug = faker.string.alpha(10)
        const orgName = 'Test Organization'
        const mockOrgs = [createMockOrg({ slug: orgSlug, name: orgName, supportedLanguages: [language] })]

        mockUseQuery.mockReturnValue({
            data: mockOrgs,
            isLoading: false,
        })

        const form = createMockForm({ orgSlug })
        renderWithProviders(<ProgrammingLanguageSection form={form} />)

        expect(
            screen.getByText(
                `At the present ${orgName} only supports ${displayName}. Code files submitted in other languages will not be able to run.`,
            ),
        ).toBeDefined()
    })

    it('shows multi-language message when org supports both R and Python', () => {
        const orgSlug = faker.string.alpha(10)
        const orgName = 'Test Organization'
        const mockOrgs = [createMockOrg({ slug: orgSlug, name: orgName, supportedLanguages: ['R', 'PYTHON'] })]

        mockUseQuery.mockReturnValue({
            data: mockOrgs,
            isLoading: false,
        })

        const form = createMockForm({ orgSlug })
        renderWithProviders(<ProgrammingLanguageSection form={form} />)

        expect(
            screen.getByText(
                `Indicate the programming language that you will use in your data analysis. ${orgName} will use this to setup the right environment for you.`,
            ),
        ).toBeDefined()
    })

    it('shows no base images message when org has no supported languages', () => {
        const orgSlug = faker.string.alpha(10)
        const orgName = 'Test Organization'
        const mockOrgs = [createMockOrg({ slug: orgSlug, name: orgName, supportedLanguages: [] })]

        mockUseQuery.mockReturnValue({
            data: mockOrgs,
            isLoading: false,
        })

        const form = createMockForm({ orgSlug })
        renderWithProviders(<ProgrammingLanguageSection form={form} />)

        expect(
            screen.getByText(
                `No base images are currently configured for ${orgName}. You can still select the language you intend to use; an administrator will need to configure a matching base image before your code can run.`,
            ),
        ).toBeDefined()
    })

    it('renders radio buttons for available languages', () => {
        const orgSlug = faker.string.alpha(10)
        const mockOrgs = [createMockOrg({ slug: orgSlug, supportedLanguages: ['R', 'PYTHON'] })]

        mockUseQuery.mockReturnValue({
            data: mockOrgs,
            isLoading: false,
        })

        const form = createMockForm({ orgSlug })
        renderWithProviders(<ProgrammingLanguageSection form={form} />)

        expect(screen.getByRole('radio', { name: 'R' })).toBeDefined()
        expect(screen.getByRole('radio', { name: 'Python' })).toBeDefined()
    })

    it('uses fallback org name when org is not found in list', () => {
        const orgSlug = faker.string.alpha(10)
        // Org list doesn't contain the selected org
        const mockOrgs: ReturnType<typeof createMockOrg>[] = []

        mockUseQuery.mockReturnValue({
            data: mockOrgs,
            isLoading: false,
        })

        const form = createMockForm({ orgSlug })
        renderWithProviders(<ProgrammingLanguageSection form={form} />)

        // Should use 'this data organization' as fallback and show no base images message
        expect(
            screen.getByText(
                'No base images are currently configured for this data organization. You can still select the language you intend to use; an administrator will need to configure a matching base image before your code can run.',
            ),
        ).toBeDefined()
    })

    it('calls setFieldValue when a radio button is clicked', async () => {
        const orgSlug = faker.string.alpha(10)
        const mockOrgs = [createMockOrg({ slug: orgSlug, supportedLanguages: ['R', 'PYTHON'] })]

        mockUseQuery.mockReturnValue({
            data: mockOrgs,
            isLoading: false,
        })

        const form = createMockForm({ orgSlug })

        renderWithProviders(<ProgrammingLanguageSection form={form} />)

        const pythonRadio = screen.getByRole('radio', { name: 'Python' })
        await userEvent.click(pythonRadio)

        expect(form.setFieldValue).toHaveBeenCalledWith('language', 'PYTHON')
    })

    it('resets language to null when the selected org changes', () => {
        const orgSlug1 = faker.string.alpha(10)
        const orgSlug2 = faker.string.alpha(10)
        const mockOrgs = [
            createMockOrg({ slug: orgSlug1, name: 'Test Org 1', supportedLanguages: ['R'] }),
            createMockOrg({ slug: orgSlug2, name: 'Test Org 2', supportedLanguages: ['PYTHON'] }),
        ]

        mockUseQuery.mockReturnValue({
            data: mockOrgs,
            isLoading: false,
        })

        const form = createMockForm({ orgSlug: orgSlug1, language: 'R' })

        // Override setFieldValue so it actually mutates form.values, while still being spy-able.
        const setFieldValueSpy = vi.fn((field: keyof StudyProposalFormValues, value: unknown) => {
            ;(form.values as StudyProposalFormValues)[field] = value as never
        })
        ;(form as unknown as { setFieldValue: typeof setFieldValueSpy }).setFieldValue = setFieldValueSpy

        // Initial render with the first org selected (effect will run once here)
        renderWithProviders(<ProgrammingLanguageSection form={form} />)

        // Clear the spy to only track calls after initial render
        setFieldValueSpy.mockClear()

        // Simulate user selecting a language
        form.values.language = 'PYTHON'

        // Change org and render a new instance with the updated slug
        form.values.orgSlug = orgSlug2
        renderWithProviders(<ProgrammingLanguageSection form={form} />)

        // After org change, the effect should have requested a reset of the language field
        expect(setFieldValueSpy).toHaveBeenCalledWith('language', null)
    })

    it('auto-selects the language when only a single language is available', () => {
        const orgSlug = faker.string.alpha(10)
        const mockOrgs = [createMockOrg({ slug: orgSlug, supportedLanguages: ['PYTHON'] })]

        mockUseQuery.mockReturnValue({
            data: mockOrgs,
            isLoading: false,
        })

        const form = createMockForm({ orgSlug, language: null })

        renderWithProviders(<ProgrammingLanguageSection form={form} />)

        // language should have been auto-selected to PYTHON
        expect(form.setFieldValue).toHaveBeenCalledWith('language', 'PYTHON')
    })

    it('allows admin reviewers to see both R and Python even if only one non-testing language is configured', () => {
        const orgSlug = faker.string.alpha(10)
        const orgId = faker.string.uuid()

        // Only R is configured as a non-testing language at the org level
        const mockOrgs = [createMockOrg({ slug: orgSlug, name: 'Admin Test Org', supportedLanguages: ['R'] })]

        mockUseQuery.mockReturnValue({
            data: mockOrgs,
            isLoading: false,
        })

        // Simulate being an admin for this org so ProgrammingLanguageSection uses the
        // special-case behavior and always exposes both R and Python options.
        mockUseSession.mockReturnValue({
            isLoaded: true,
            session: {
                user: { id: 'admin-user-1', isSiAdmin: false, clerkUserId: 'clerk-admin-1' },
                orgs: {
                    [orgId]: {
                        id: orgId,
                        slug: orgSlug,
                        type: 'enclave',
                        isAdmin: true,
                    },
                },
            },
        })

        const form = createMockForm({ orgSlug })

        renderWithProviders(<ProgrammingLanguageSection form={form} />)

        // Even though only R has a non-testing base image, admin reviewers should be able
        // to choose either R or Python so they can exercise test-only Python images.
        expect(screen.getByRole('radio', { name: 'R' })).toBeDefined()
        expect(screen.getByRole('radio', { name: 'Python' })).toBeDefined()
    })
})
