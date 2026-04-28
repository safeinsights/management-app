import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest'
import {
    createUserAndWorkspace,
    generateWorkspaceName,
    getCoderOrganizationId,
    getCoderTemplateId,
    getOrCreateCoderUser,
    generateCoderUsername,
    shaHash,
} from './coder'
import { getConfigValue } from './config'
import { getStudyAndOrgDisplayInfo, siUser, fetchLatestCodeEnvForStudyId } from './db/queries'
import { fetchFileContents } from './storage'

// Mock external dependencies
vi.mock('./config', () => ({
    getConfigValue: vi.fn(),
}))

vi.mock('./db/queries', () => ({
    getStudyAndOrgDisplayInfo: vi.fn(),
    siUser: vi.fn(),
    fetchLatestCodeEnvForStudyId: vi.fn(),
}))

vi.mock('./storage', () => ({
    fetchFileContents: vi.fn().mockResolvedValue({
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
    }),
}))

vi.mock('@/lib/logger', () => ({
    default: {
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
    },
}))

vi.mock('node:fs/promises', () => ({
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    utimes: vi.fn().mockResolvedValue(undefined),
}))

// Mock fetch globally
global.fetch = vi.fn()

const getConfigValueMock = getConfigValue as unknown as Mock
const getStudyAndOrgDisplayInfoMock = getStudyAndOrgDisplayInfo as unknown as Mock
const siUserMock = siUser as unknown as Mock
const fetchLatestCodeEnvForStudyIdMock = fetchLatestCodeEnvForStudyId as unknown as Mock
const fetchFileContentsMock = fetchFileContents as unknown as Mock

const mockUsersEmailQueryResponse = { users: [{ id: 'user123', name: 'John Doe', email: 'john@example.com' }] }

describe('getOrCreateCoderUser', () => {
    const ORIGINAL_ENV = process.env

    beforeEach(() => {
        process.env = { ...ORIGINAL_ENV }
        vi.resetAllMocks()
        global.fetch = vi.fn()
    })

    afterEach(() => {
        process.env = ORIGINAL_ENV
    })

    it('should get existing user when user exists', async () => {
        const mockFetch = global.fetch as unknown as Mock
        mockFetch.mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue(mockUsersEmailQueryResponse),
        })

        getConfigValueMock.mockResolvedValue('https://api.coder.com')
        getStudyAndOrgDisplayInfoMock.mockResolvedValue({
            researcherEmail: 'john@example.com',
        })

        const result = await getOrCreateCoderUser('study123')
        expect(result).toEqual(expect.objectContaining(mockUsersEmailQueryResponse.users[0]))
        expect(mockFetch).toHaveBeenCalledWith('https://api.coder.com/api/v2/users?q=john%40example.com', {
            method: 'GET',
            headers: {
                Accept: 'application/json',
                'Coder-Session-Token': 'https://api.coder.com',
            },
        })
    })

    it('should create user when user does not exist (400 status)', async () => {
        const mockFetch = global.fetch as unknown as Mock
        // Mock the fetch calls in the right order:
        // 1. First fetch - check if user exists (returns 400)
        // 2. Second fetch - get organizations (for createCoderUser)
        // 3. Third fetch - create user (returns success)
        mockFetch
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: vi.fn().mockResolvedValue([]),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: vi.fn().mockResolvedValue([{ id: 'org', name: 'coder' }]),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: vi.fn().mockResolvedValue(mockUsersEmailQueryResponse),
            })

        // Mock all the config values needed in order of calls
        getConfigValueMock.mockResolvedValueOnce('https://api.coder.com') // CODER_API_ENDPOINT (for getCoderUser)
        getConfigValueMock.mockResolvedValueOnce('token') // CODER_TOKEN (for getCoderUser)
        getConfigValueMock.mockResolvedValueOnce('https://api.coder.com') // CODER_API_ENDPOINT (for getCoderOrganization)
        getConfigValueMock.mockResolvedValueOnce('token') // CODER_TOKEN (for getCoderOrganization)
        getConfigValueMock.mockResolvedValueOnce('https://api.coder.com') // CODER_API_ENDPOINT (for createCoderUser)
        getConfigValueMock.mockResolvedValueOnce('token') // CODER_TOKEN (for createCoderUser)
        getStudyAndOrgDisplayInfoMock.mockResolvedValue({
            researcherEmail: 'john@example.com',
            researcherId: 'user123',
        })
        siUserMock.mockResolvedValue({
            id: 'user123',
            primaryEmailAddress: { emailAddress: 'john@example.com' },
            fullName: 'John Doe',
        })

        const result = await getOrCreateCoderUser('study123')
        expect(result).toEqual(mockUsersEmailQueryResponse)
        // Verify the POST call to create a user was made
        expect(mockFetch).toHaveBeenNthCalledWith(3, 'https://api.coder.com/api/v2/users', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'Coder-Session-Token': 'token',
            },
            body: JSON.stringify({
                email: 'john@example.com',
                login_type: 'oidc',
                name: undefined,
                username: 'john-example-com-855f96e9',
                user_status: 'active',
                organization_ids: ['org'],
            }),
        })
    })

    it('should throw error for other HTTP errors', async () => {
        const mockFetch = global.fetch as unknown as Mock
        mockFetch.mockResolvedValue({
            ok: false,
            status: 500,
            text: vi.fn().mockResolvedValue('Internal server error'),
        })

        getConfigValueMock.mockResolvedValue('https://api.coder.com')
        getStudyAndOrgDisplayInfoMock.mockResolvedValue({
            researcherEmail: 'john@example.com',
            researcherId: 'user123',
        })

        await expect(getOrCreateCoderUser('study123')).rejects.toThrow(
            'Failed to query users: 500 Internal server error',
        )
    })
})

describe('createUserAndWorkspace', () => {
    const ORIGINAL_ENV = process.env

    beforeEach(() => {
        process.env = { ...ORIGINAL_ENV, BUCKET_NAME: 'test-bucket' }
        vi.resetAllMocks()
        global.fetch = vi.fn()
    })

    afterEach(() => {
        process.env = ORIGINAL_ENV
    })

    it('should create user and workspace successfully with correct rich_parameter_values', async () => {
        const mockWorkspaceResponse = { id: 'workspace123', name: 'test-workspace' }
        const mockFetch = global.fetch as unknown as Mock
        mockFetch.mockImplementation((url: string) => {
            if (url.includes('/users?')) {
                return Promise.resolve({
                    ok: true,
                    json: vi.fn().mockResolvedValue(mockUsersEmailQueryResponse),
                })
            }
            if (url.includes('/workspaces/') || url.includes('@')) {
                return Promise.resolve({
                    ok: false,
                    status: 404,
                    text: vi.fn().mockResolvedValue('Not found'),
                })
            }
            if (url.includes('/templates')) {
                return Promise.resolve({
                    ok: true,
                    json: vi.fn().mockResolvedValue([{ id: 'template1', name: 'aws-fargate' }]),
                })
            }
            // Check /members/ before /organizations since workspace create URL contains both
            if (url.includes('/members/')) {
                return Promise.resolve({
                    ok: true,
                    json: vi.fn().mockResolvedValue(mockWorkspaceResponse),
                })
            }
            if (url.includes('/organizations')) {
                return Promise.resolve({
                    ok: true,
                    json: vi.fn().mockResolvedValue([{ id: 'org1', name: 'coder' }]),
                })
            }
            return Promise.resolve({
                ok: false,
                status: 404,
                text: vi.fn().mockResolvedValue('Not found'),
            })
        })

        // Mock config values - use mockImplementation to return based on key
        getConfigValueMock.mockImplementation((key: string) => {
            if (key === 'CODER_TEMPLATE') return Promise.resolve('aws-fargate')
            if (key === 'CODER_FILES') return Promise.resolve('/tmp/coder-files')
            return Promise.resolve('https://api.coder.com')
        })
        getStudyAndOrgDisplayInfoMock.mockResolvedValue({
            researcherEmail: 'john@example.com',
            researcherId: 'user123',
        })
        fetchLatestCodeEnvForStudyIdMock.mockResolvedValue({
            id: 'env-123',
            identifier: 'test_env',
            slug: 'test-org',
            url: 'test-image:latest',
            settings: { environment: [{ name: 'VAR1', value: 'value1' }] },
            starterCodeFileNames: ['main.R'],
        })
        fetchFileContentsMock.mockResolvedValue({
            arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
        })

        const result = await createUserAndWorkspace('study123')
        expect(result).toEqual({
            success: true,
            workspace: mockWorkspaceResponse,
        })

        // Verify the workspace creation call has correct rich_parameter_values
        const createWorkspaceCall = mockFetch.mock.calls.find(
            (call) => call[1]?.method === 'POST' && call[0].includes('/members/'),
        )
        expect(createWorkspaceCall).toBeDefined()
        const requestBody = JSON.parse(createWorkspaceCall![1].body)
        expect(requestBody.rich_parameter_values).toEqual([
            { name: 'study_id', value: 'study123' },
            { name: 'container_image', value: 'test-image:latest' },
            {
                name: 'environment',
                value: JSON.stringify([
                    { name: 'VAR1', value: 'value1' },
                    {
                        name: 'DATA_PATH',
                        value: `s3://${process.env.BUCKET_NAME}/code-env/test-org/env-123/sample-data`,
                    },
                    {
                        name: 'TEST_ENV_DATA_PATH',
                        value: `s3://${process.env.BUCKET_NAME}/code-env/test-org/env-123/sample-data`,
                    },
                    { name: 'TEST_ENV_S3_BUCKET_NAME', value: process.env.BUCKET_NAME },
                    { name: 'TEST_ENV_S3_BUCKET_PREFIX', value: 'code-env/test-org/env-123/sample-data' },
                    { name: 'TEST_ENV_S3_BUCKET_REGION', value: 'us-east-1' },
                ]),
            },
        ])
    })

    it('should include DATABASE_URL env vars for athena data source type', async () => {
        const mockWorkspaceResponse = { id: 'workspace123', name: 'test-workspace' }
        const mockFetch = global.fetch as unknown as Mock
        mockFetch.mockImplementation((url: string) => {
            if (url.includes('/users?')) {
                return Promise.resolve({
                    ok: true,
                    json: vi.fn().mockResolvedValue(mockUsersEmailQueryResponse),
                })
            }
            if (url.includes('/workspaces/') || url.includes('@')) {
                return Promise.resolve({
                    ok: false,
                    status: 404,
                    text: vi.fn().mockResolvedValue('Not found'),
                })
            }
            if (url.includes('/templates')) {
                return Promise.resolve({
                    ok: true,
                    json: vi.fn().mockResolvedValue([{ id: 'template1', name: 'aws-fargate' }]),
                })
            }
            if (url.includes('/members/')) {
                return Promise.resolve({
                    ok: true,
                    json: vi.fn().mockResolvedValue(mockWorkspaceResponse),
                })
            }
            if (url.includes('/organizations')) {
                return Promise.resolve({
                    ok: true,
                    json: vi.fn().mockResolvedValue([{ id: 'org1', name: 'coder' }]),
                })
            }
            return Promise.resolve({
                ok: false,
                status: 404,
                text: vi.fn().mockResolvedValue('Not found'),
            })
        })

        process.env.AWS_REGION = 'us-west-2'
        getConfigValueMock.mockImplementation((key: string) => {
            if (key === 'CODER_TEMPLATE') return Promise.resolve('aws-fargate')
            if (key === 'CODER_FILES') return Promise.resolve('/tmp/coder-files')
            if (key === 'CODER_ATHENA_WORK_GROUP') return Promise.resolve('my-workgroup')
            if (key === 'ATHENA_RESULTS_BUCKET_NAME') return Promise.resolve(null)
            return Promise.resolve('https://api.coder.com')
        })
        getStudyAndOrgDisplayInfoMock.mockResolvedValue({
            researcherEmail: 'john@example.com',
            researcherId: 'user123',
        })
        fetchLatestCodeEnvForStudyIdMock.mockResolvedValue({
            id: 'env-123',
            identifier: 'test_env',
            dataSourceType: 'athena',
            slug: 'test-org',
            url: 'test-image:latest',
            settings: { environment: [] },
            starterCodeFileNames: ['main.R'],
        })
        fetchFileContentsMock.mockResolvedValue({
            arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
        })

        await createUserAndWorkspace('study123')

        const createWorkspaceCall = mockFetch.mock.calls.find(
            (call) => call[1]?.method === 'POST' && call[0].includes('/members/'),
        )
        const requestBody = JSON.parse(createWorkspaceCall![1].body)
        const envVars = JSON.parse(
            requestBody.rich_parameter_values.find((p: { name: string }) => p.name === 'environment').value,
        )

        const dataPath = `s3://${process.env.BUCKET_NAME}/code-env/test-org/env-123/sample-data`
        const expectedDbUrl = `athena://athena.us-west-2.amazonaws.com:443/test_org_test_env?s3_location=${dataPath}`
        expect(envVars).toContainEqual({ name: 'DATABASE_URL', value: expectedDbUrl })
        expect(envVars).toContainEqual({ name: 'TEST_ENV_DATABASE_URL', value: expectedDbUrl })
        expect(envVars).toContainEqual({ name: 'AWS_ATHENA_S3_STAGING_DIR', value: dataPath })
        expect(envVars).toContainEqual({ name: 'AWS_ATHENA_WORK_GROUP', value: 'my-workgroup' })
        expect(envVars).toContainEqual({ name: 'AWS_ATHENA_DATABASE_NAME', value: 'test_org_test_env' })
        expect(envVars).toContainEqual({ name: 'AWS_REGION', value: 'us-west-2' })
        expect(envVars).toContainEqual({ name: 'TEST_ENV_S3_BUCKET_NAME', value: process.env.BUCKET_NAME })
        expect(envVars).toContainEqual({
            name: 'TEST_ENV_S3_BUCKET_PREFIX',
            value: 'code-env/test-org/env-123/sample-data',
        })
        expect(envVars).toContainEqual({ name: 'TEST_ENV_S3_BUCKET_REGION', value: 'us-west-2' })
    })

    it('should include DATABASE_URL env vars for postgres data source type', async () => {
        const mockWorkspaceResponse = { id: 'workspace123', name: 'test-workspace' }
        const mockFetch = global.fetch as unknown as Mock
        mockFetch.mockImplementation((url: string) => {
            if (url.includes('/users?')) {
                return Promise.resolve({
                    ok: true,
                    json: vi.fn().mockResolvedValue(mockUsersEmailQueryResponse),
                })
            }
            if (url.includes('/workspaces/') || url.includes('@')) {
                return Promise.resolve({
                    ok: false,
                    status: 404,
                    text: vi.fn().mockResolvedValue('Not found'),
                })
            }
            if (url.includes('/templates')) {
                return Promise.resolve({
                    ok: true,
                    json: vi.fn().mockResolvedValue([{ id: 'template1', name: 'aws-fargate' }]),
                })
            }
            if (url.includes('/members/')) {
                return Promise.resolve({
                    ok: true,
                    json: vi.fn().mockResolvedValue(mockWorkspaceResponse),
                })
            }
            if (url.includes('/organizations')) {
                return Promise.resolve({
                    ok: true,
                    json: vi.fn().mockResolvedValue([{ id: 'org1', name: 'coder' }]),
                })
            }
            return Promise.resolve({
                ok: false,
                status: 404,
                text: vi.fn().mockResolvedValue('Not found'),
            })
        })

        getConfigValueMock.mockImplementation((key: string) => {
            if (key === 'CODER_TEMPLATE') return Promise.resolve('aws-fargate')
            if (key === 'CODER_FILES') return Promise.resolve('/tmp/coder-files')
            if (key === 'CODER_SAMPLE_DATA_POSTGRES_HOST') return Promise.resolve('pg-host.example.com:5432')
            if (key === 'CODER_SAMPLE_DATA_READ_ONLY_POSTGRES_USER') return Promise.resolve('readonly_user')
            return Promise.resolve('https://api.coder.com')
        })
        getStudyAndOrgDisplayInfoMock.mockResolvedValue({
            researcherEmail: 'john@example.com',
            researcherId: 'user123',
        })
        fetchLatestCodeEnvForStudyIdMock.mockResolvedValue({
            id: 'env-123',
            identifier: 'test_env',
            dataSourceType: 'postgres',
            slug: 'test-org',
            url: 'test-image:latest',
            settings: { environment: [] },
            starterCodeFileNames: ['main.R'],
        })
        fetchFileContentsMock.mockResolvedValue({
            arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
        })

        await createUserAndWorkspace('study123')

        const createWorkspaceCall = mockFetch.mock.calls.find(
            (call) => call[1]?.method === 'POST' && call[0].includes('/members/'),
        )
        const requestBody = JSON.parse(createWorkspaceCall![1].body)
        const envVars = JSON.parse(
            requestBody.rich_parameter_values.find((p: { name: string }) => p.name === 'environment').value,
        )

        expect(envVars).toContainEqual({
            name: 'DATABASE_URL',
            value: 'postgres://readonly_user@pg-host.example.com:5432/test_org_test_env',
        })
        expect(envVars).toContainEqual({
            name: 'TEST_ENV_DATABASE_URL',
            value: 'postgres://readonly_user@pg-host.example.com:5432/test_org_test_env',
        })
        expect(envVars).toContainEqual({ name: 'TEST_ENV_S3_BUCKET_NAME', value: process.env.BUCKET_NAME })
        expect(envVars).toContainEqual({
            name: 'TEST_ENV_S3_BUCKET_PREFIX',
            value: 'code-env/test-org/env-123/sample-data',
        })
        expect(envVars).toContainEqual({ name: 'TEST_ENV_S3_BUCKET_REGION', value: 'us-east-1' })
    })

    it('should throw error when user creation fails', async () => {
        const mockFetch = global.fetch as unknown as Mock
        mockFetch.mockResolvedValue({
            ok: false,
            status: 500,
            text: vi.fn().mockResolvedValue('Internal server error'),
        })

        getConfigValueMock.mockResolvedValue('https://api.coder.com')
        getStudyAndOrgDisplayInfoMock.mockResolvedValue({
            researcherEmail: 'john@example.com',
            researcherId: 'user123',
        })
        fetchLatestCodeEnvForStudyIdMock.mockResolvedValue({
            id: 'env-123',
            identifier: 'test_env',
            slug: 'test-org',
            url: 'test-image:latest',
            settings: {},
            starterCodeFileNames: ['main.R'],
        })

        await expect(createUserAndWorkspace('study123')).rejects.toThrow(
            'Failed to create user and workspace: Failed to query users: 500 Internal server error',
        )
    })
})

describe('getCoderOrganization', () => {
    const ORIGINAL_ENV = process.env

    beforeEach(() => {
        process.env = { ...ORIGINAL_ENV }
        vi.resetAllMocks()
        global.fetch = vi.fn()
    })

    afterEach(() => {
        process.env = ORIGINAL_ENV
    })

    it('should return organization ID when found', async () => {
        const mockOrgResponse = [
            { id: 'org1', name: 'other-org' },
            { id: 'org2', name: 'coder' },
        ]
        const mockFetch = global.fetch as unknown as Mock
        mockFetch.mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue(mockOrgResponse),
        })

        getConfigValueMock.mockResolvedValue('https://api.coder.com')

        const result = await getCoderOrganizationId()
        expect(result).toBe('org2')
    })

    it('should throw error when organization fetch fails', async () => {
        const mockFetch = global.fetch as unknown as Mock
        mockFetch.mockResolvedValue({
            ok: false,
            status: 500,
            text: vi.fn().mockResolvedValue('Internal server error'),
        })

        getConfigValueMock.mockResolvedValue('https://api.coder.com')

        await expect(getCoderOrganizationId()).rejects.toThrow('Failed to fetch organization data from Coder API')
    })
})

describe('getCoderTemplateId', () => {
    const ORIGINAL_ENV = process.env

    beforeEach(() => {
        process.env = { ...ORIGINAL_ENV }
        vi.resetAllMocks()
        global.fetch = vi.fn()
    })

    afterEach(() => {
        process.env = ORIGINAL_ENV
    })

    it('should return template ID when found', async () => {
        const mockTemplateResponse = [
            { id: 'template1', name: 'other-template' },
            { id: 'template2', name: 'aws-fargate' },
        ]
        const mockFetch = global.fetch as unknown as Mock
        mockFetch.mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue(mockTemplateResponse),
        })

        // Mock config calls in order: CODER_TEMPLATE first, then CODER_API_ENDPOINT and CODER_TOKEN from coderFetch
        getConfigValueMock.mockResolvedValueOnce('aws-fargate') // CODER_TEMPLATE
        getConfigValueMock.mockResolvedValueOnce('https://api.coder.com') // CODER_API_ENDPOINT
        getConfigValueMock.mockResolvedValueOnce('token') // CODER_TOKEN

        const result = await getCoderTemplateId()
        expect(result).toBe('template2')
        expect(mockFetch).toHaveBeenCalledWith('https://api.coder.com/api/v2/templates', {
            method: 'GET',
            headers: {
                Accept: 'application/json',
                'Coder-Session-Token': 'token',
            },
        })
    })

    it('should throw error when template fetch fails', async () => {
        const mockFetch = global.fetch as unknown as Mock
        mockFetch.mockResolvedValue({
            ok: false,
            status: 500,
            text: vi.fn().mockResolvedValue('Internal server error'),
        })

        getConfigValueMock.mockResolvedValue('https://api.coder.com')
        getConfigValueMock.mockResolvedValueOnce('my-template')

        await expect(getCoderTemplateId()).rejects.toThrow('Failed to fetch templates data from Coder API')
    })
})

describe('generateWorkspaceName', () => {
    const user = {
        id: '00000000-0000-0000-0000-000000000001',
        username: 'testuser',
        email: 'test@example.com',
        name: 'Test User',
        status: 'active',
    }
    const userSuffix = shaHash(user.id).slice(0, 4)

    it('should generate <studyHash>-<userHash> for a UUID studyId', () => {
        const uuid = '550e8400-e29b-41d4-a716-446655440000'
        const result = generateWorkspaceName(uuid, user)
        expect(result).toBe(`a3a9e1ed97-${userSuffix}`)
    })

    it('should generate <studyHash>-<userHash> for a UUID studyId without hyphens', () => {
        const uuid = '550e8400e29b41d4a716446655440000'
        const result = generateWorkspaceName(uuid, user)
        expect(result).toBe(`140f39b05a-${userSuffix}`)
    })

    it('should be case-insensitive on the studyId', () => {
        const uuid = '550E8400-E29B-41D4-A716-446655440000'
        const result = generateWorkspaceName(uuid, user)
        expect(result).toBe(`a3a9e1ed97-${userSuffix}`)
    })

    it('should change the suffix when the user id changes', () => {
        const uuid = '550e8400-e29b-41d4-a716-446655440000'
        const otherUser = { ...user, id: '00000000-0000-0000-0000-000000000002' }
        const otherSuffix = shaHash(otherUser.id).slice(0, 4)
        const result = generateWorkspaceName(uuid, otherUser)
        expect(result).toBe(`a3a9e1ed97-${otherSuffix}`)
        expect(otherSuffix).not.toBe(userSuffix)
    })
})

describe('md5Hash', () => {
    it('should generate correct MD5 hash for empty string', () => {
        const result = shaHash('')
        expect(result).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    })

    it('should generate consistent MD5 hash for same input', () => {
        const input = 'hello world'
        const result1 = shaHash(input)
        const result2 = shaHash(input)
        expect(result1).toBe(result2)
        expect(result1).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9')
    })

    it('should generate different hashes for different inputs', () => {
        const result1 = shaHash('hello')
        const result2 = shaHash('world')
        expect(result1).not.toBe(result2)
        expect(result1).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
        expect(result2).toBe('486ea46224d1bb4fb680f34f7c9ad96a8f24ec88be73ea8e5a6c65260e9cb8a7')
    })

    it('should handle special characters correctly', () => {
        const result = shaHash('hello\nworld')
        expect(result).toBe('26c60a61d01db5836ca70fefd44a6a016620413c8ef5f259a6c5612d4f79d3b8')
    })

    it('should handle unicode characters', () => {
        const result = shaHash('café')
        expect(result).toBe('850f7dc43910ff890f8879c0ed26fe697c93a067ad93a7d50f466a7028a9bf4e')
    })

    it('should handle long strings', () => {
        const longString = 'a'.repeat(1000)
        const result = shaHash(longString)
        expect(result).toBe('41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3')
    })

    it('should handle strings with spaces', () => {
        const result = shaHash('hello world')
        expect(result).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9')
    })
})

describe('generateCoderUsername', () => {
    it('should sanitize email by replacing non-alphanumeric characters with underscores', () => {
        const result = generateCoderUsername('test220@gmail.com')
        expect(result).toMatch(/^test220-gmail-com-[a-f0-9]{8}$/)
    })

    it('should truncate long emails to fit within 31 character limit', () => {
        const result = generateCoderUsername('test2201512345678901234567@gmail.com')
        expect(result.length).toBe(31)
        // Sanitized email should be truncated to 22 chars + hyphen + 8 char hash
        expect(result).toMatch(/^[a-zA-Z0-9-]{22}-[a-f0-9]{8}$/)
    })

    it('should not truncate short emails', () => {
        const result = generateCoderUsername('test2201567@gmail.com')
        // test22015678-gmail-com = 21 chars, plus hyphen and 8 char hash = 30 chars
        expect(result).toMatch(/^test2201567-gmail-com-[a-f0-9]{8}$/)
        expect(result.length).toBe(30)
    })

    it('should generate consistent hash for same email', () => {
        const result1 = generateCoderUsername('test@example.com')
        const result2 = generateCoderUsername('test@example.com')
        expect(result1).toBe(result2)
    })

    it('should generate different hashes for different emails', () => {
        const result1 = generateCoderUsername('test1@example.com')
        const result2 = generateCoderUsername('test2@example.com')
        expect(result1).not.toBe(result2)
    })

    it('should handle emails with multiple special characters', () => {
        const result = generateCoderUsername('user.name+tag@sub.domain.com')
        expect(result).toMatch('user-name-tag-sub-doma-f7fdd5e8')
        expect(result.length).toBeLessThanOrEqual(31)
    })

    it('should always produce result of 31 characters or less', () => {
        const longEmail = 'verylongemailaddressthatexceedslimit@verylongdomainname.com'
        const result = generateCoderUsername(longEmail)
        expect(result.length).toBeLessThanOrEqual(31)
    })

    it('should produce alphanumeric usernames with underscores and one hyphen', () => {
        const result = generateCoderUsername('ANY.email@test.org')
        // Should only contain alphanumeric, underscores, and exactly one hyphen before hash
        expect(result).toMatch(/^[a-zA-Z0-9-]+-[a-f0-9]{8}$/)
    })

    it('should avoid including -- when input email otherwise generates it', () => {
        const result = generateCoderUsername('ab45---123456790@test.org')
        // should not contain multiple '-' characters
        expect(result).not.toMatch(/-{2,}/)
        expect(result).toMatch(/^[a-zA-Z0-9-]+-[a-f0-9]{8}$/)
    })
})
