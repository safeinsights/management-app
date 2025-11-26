import { describe, it, expect, vi, beforeEach, Mock } from 'vitest'
import { renderWithProviders, screen, faker } from '@/tests/unit.helpers'
import { useQuery } from '@/common'
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

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('shows placeholder when no org is selected', () => {
        mockUseQuery.mockReturnValue({
            data: undefined,
            isLoading: false,
            isError: false,
        })

        const form = createMockForm({ orgSlug: '' })
        renderWithProviders(<ProgrammingLanguageSection form={form} />)

        expect(screen.getByText('Step 3 of 4')).toBeDefined()
        expect(screen.getByText('Programming language')).toBeDefined()
        expect(
            screen.getByText('Select a data organization above to see which programming languages are available.'),
        ).toBeDefined()
    })

    it('shows loading state when fetching base images', () => {
        const orgSlug = faker.string.alpha(10)
        const mockOrgs = [{ slug: orgSlug, name: 'Test Org', type: 'enclave' }]

        mockUseQuery
            .mockReturnValueOnce({
                data: mockOrgs,
                isLoading: false,
                isError: false,
            })
            .mockReturnValueOnce({
                data: undefined,
                isLoading: true,
                isError: false,
            })

        const form = createMockForm({ orgSlug })
        renderWithProviders(<ProgrammingLanguageSection form={form} />)

        expect(screen.getByText('Loading available programming languages…')).toBeDefined()
    })

    it('shows error state when base images fetch fails', () => {
        const orgSlug = faker.string.alpha(10)
        const mockOrgs = [{ slug: orgSlug, name: 'Test Org', type: 'enclave' }]

        mockUseQuery
            .mockReturnValueOnce({
                data: mockOrgs,
                isLoading: false,
                isError: false,
            })
            .mockReturnValueOnce({
                data: undefined,
                isLoading: false,
                isError: true,
            })

        const form = createMockForm({ orgSlug })
        renderWithProviders(<ProgrammingLanguageSection form={form} />)

        expect(
            screen.getByText(
                'We were unable to determine which programming languages are supported for this data organization. You can still select a language below.',
            ),
        ).toBeDefined()
    })

    it('shows single language message when org supports only R', () => {
        const orgSlug = faker.string.alpha(10)
        const orgName = 'Test Organization'
        const mockOrgs = [{ slug: orgSlug, name: orgName, type: 'enclave' }]
        const mockBaseImages = [{ id: '1', language: 'R', isTesting: false, name: 'R Base Image' }]

        mockUseQuery
            .mockReturnValueOnce({
                data: mockOrgs,
                isLoading: false,
                isError: false,
            })
            .mockReturnValueOnce({
                data: mockBaseImages,
                isLoading: false,
                isError: false,
            })

        const form = createMockForm({ orgSlug })
        renderWithProviders(<ProgrammingLanguageSection form={form} />)

        expect(
            screen.getByText(
                `At the present ${orgName} only supports R. Code files submitted in other languages will not be able to run.`,
            ),
        ).toBeDefined()
    })

    it('does not show error message when base images exist but query is in error state', () => {
        const orgSlug = faker.string.alpha(10)
        const orgName = 'Test Organization'
        const mockOrgs = [{ slug: orgSlug, name: orgName, type: 'enclave' }]
        const mockBaseImages = [{ id: '1', language: 'R', isTesting: false, name: 'R Base Image' }]

        mockUseQuery
            .mockReturnValueOnce({
                data: mockOrgs,
                isLoading: false,
                isError: false,
            })
            .mockReturnValueOnce({
                data: mockBaseImages,
                isLoading: false,
                isError: true,
            })

        const form = createMockForm({ orgSlug })
        renderWithProviders(<ProgrammingLanguageSection form={form} />)

        expect(
            screen.queryByText(
                'We were unable to determine which programming languages are supported for this data organization. You can still select a language below.',
            ),
        ).toBeNull()

        // We still render the language options from cached data even if the latest query errored
        expect(screen.getByRole('radio', { name: 'R' })).toBeDefined()
    })

    it('shows single language message when org supports only Python', () => {
        const orgSlug = faker.string.alpha(10)
        const orgName = 'Test Organization'
        const mockOrgs = [{ slug: orgSlug, name: orgName, type: 'enclave' }]
        const mockBaseImages = [{ id: '1', language: 'PYTHON', isTesting: false, name: 'Python Base Image' }]

        mockUseQuery
            .mockReturnValueOnce({
                data: mockOrgs,
                isLoading: false,
                isError: false,
            })
            .mockReturnValueOnce({
                data: mockBaseImages,
                isLoading: false,
                isError: false,
            })

        const form = createMockForm({ orgSlug })
        renderWithProviders(<ProgrammingLanguageSection form={form} />)

        expect(
            screen.getByText(
                `At the present ${orgName} only supports Python. Code files submitted in other languages will not be able to run.`,
            ),
        ).toBeDefined()
    })

    it('shows multi-language message when org supports both R and Python', () => {
        const orgSlug = faker.string.alpha(10)
        const orgName = 'Test Organization'
        const mockOrgs = [{ slug: orgSlug, name: orgName, type: 'enclave' }]
        const mockBaseImages = [
            { id: '1', language: 'R', isTesting: false, name: 'R Base Image' },
            { id: '2', language: 'PYTHON', isTesting: false, name: 'Python Base Image' },
        ]

        mockUseQuery
            .mockReturnValueOnce({
                data: mockOrgs,
                isLoading: false,
                isError: false,
            })
            .mockReturnValueOnce({
                data: mockBaseImages,
                isLoading: false,
                isError: false,
            })

        const form = createMockForm({ orgSlug })
        renderWithProviders(<ProgrammingLanguageSection form={form} />)

        expect(
            screen.getByText(
                `Indicate the programming language that you will use in your data analysis. ${orgName} will use this to setup the right environment for you.`,
            ),
        ).toBeDefined()
    })

    it('shows no base images message when org has no non-testing base images', () => {
        const orgSlug = faker.string.alpha(10)
        const orgName = 'Test Organization'
        const mockOrgs = [{ slug: orgSlug, name: orgName, type: 'enclave' }]
        const mockBaseImages = [{ id: '1', language: 'R', isTesting: true, name: 'Testing R Image' }]

        mockUseQuery
            .mockReturnValueOnce({
                data: mockOrgs,
                isLoading: false,
                isError: false,
            })
            .mockReturnValueOnce({
                data: mockBaseImages,
                isLoading: false,
                isError: false,
            })

        const form = createMockForm({ orgSlug })
        renderWithProviders(<ProgrammingLanguageSection form={form} />)

        expect(
            screen.getByText(
                `No base images are currently configured for ${orgName}. You can still select the language you intend to use; an administrator will need to configure a matching base image before your code can run.`,
            ),
        ).toBeDefined()
    })

    it('shows no base images message when org has empty base images array', () => {
        const orgSlug = faker.string.alpha(10)
        const orgName = 'Test Organization'
        const mockOrgs = [{ slug: orgSlug, name: orgName, type: 'enclave' }]

        mockUseQuery
            .mockReturnValueOnce({
                data: mockOrgs,
                isLoading: false,
                isError: false,
            })
            .mockReturnValueOnce({
                data: [],
                isLoading: false,
                isError: false,
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
        const mockOrgs = [{ slug: orgSlug, name: 'Test Org', type: 'enclave' }]
        const mockBaseImages = [
            { id: '1', language: 'R', isTesting: false, name: 'R Base Image' },
            { id: '2', language: 'PYTHON', isTesting: false, name: 'Python Base Image' },
        ]

        mockUseQuery
            .mockReturnValueOnce({
                data: mockOrgs,
                isLoading: false,
                isError: false,
            })
            .mockReturnValueOnce({
                data: mockBaseImages,
                isLoading: false,
                isError: false,
            })

        const form = createMockForm({ orgSlug })
        renderWithProviders(<ProgrammingLanguageSection form={form} />)

        expect(screen.getByRole('radio', { name: 'R' })).toBeDefined()
        expect(screen.getByRole('radio', { name: 'Python' })).toBeDefined()
    })

    it('filters out testing base images when determining supported languages', () => {
        const orgSlug = faker.string.alpha(10)
        const orgName = 'Test Organization'
        const mockOrgs = [{ slug: orgSlug, name: orgName, type: 'enclave' }]
        const mockBaseImages = [
            { id: '1', language: 'R', isTesting: false, name: 'R Base Image' },
            { id: '2', language: 'PYTHON', isTesting: true, name: 'Python Testing Image' },
        ]

        mockUseQuery
            .mockReturnValueOnce({
                data: mockOrgs,
                isLoading: false,
                isError: false,
            })
            .mockReturnValueOnce({
                data: mockBaseImages,
                isLoading: false,
                isError: false,
            })

        const form = createMockForm({ orgSlug })
        renderWithProviders(<ProgrammingLanguageSection form={form} />)

        // Since only R is non-testing, should show single language message
        expect(
            screen.getByText(
                `At the present ${orgName} only supports R. Code files submitted in other languages will not be able to run.`,
            ),
        ).toBeDefined()
    })

    it('uses fallback org name when org name is not found', () => {
        const orgSlug = faker.string.alpha(10)
        const mockOrgs: Array<{ slug: string; name: string; type: string }> = []
        const mockBaseImages = [{ id: '1', language: 'R', isTesting: false, name: 'R Base Image' }]

        mockUseQuery
            .mockReturnValueOnce({
                data: mockOrgs,
                isLoading: false,
                isError: false,
            })
            .mockReturnValueOnce({
                data: mockBaseImages,
                isLoading: false,
                isError: false,
            })

        const form = createMockForm({ orgSlug })
        renderWithProviders(<ProgrammingLanguageSection form={form} />)

        // Should use 'this data organization' as fallback
        expect(
            screen.getByText(
                'At the present this data organization only supports R. Code files submitted in other languages will not be able to run.',
            ),
        ).toBeDefined()
    })
})
