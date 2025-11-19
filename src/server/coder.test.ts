import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest'
import {
    createUserAndWorkspace,
    generateWorkspaceName,
    getCoderOrganizationId,
    getCoderTemplateId,
    getOrCreateCoderUser,
    shaHash,
} from './coder'
import { getConfigValue } from './config'
import { getStudyAndOrgDisplayInfo, siUser } from './db/queries'

// Mock external dependencies
vi.mock('./config', () => ({
    getConfigValue: vi.fn(),
}))

vi.mock('./db/queries', () => ({
    getStudyAndOrgDisplayInfo: vi.fn(),
    siUser: vi.fn(),
}))

// Mock fetch globally
global.fetch = vi.fn()

const getConfigValueMock = getConfigValue as unknown as Mock
const getStudyAndOrgDisplayInfoMock = getStudyAndOrgDisplayInfo as unknown as Mock
const siUserMock = siUser as unknown as Mock

describe('getCoderUser', () => {
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
        const mockUserResponse = { id: 'user123', name: 'John Doe' }
        const mockFetch = global.fetch as unknown as Mock
        mockFetch.mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue(mockUserResponse),
        })

        getConfigValueMock.mockResolvedValue('https://api.coder.com')
        getStudyAndOrgDisplayInfoMock.mockResolvedValue({
            researcherEmail: 'john@example.com',
            researcherId: 'user123',
        })

        const result = await getOrCreateCoderUser('study123')
        expect(result).toEqual(mockUserResponse)
        expect(mockFetch).toHaveBeenCalledWith('https://api.coder.com/api/v2/users/11bb52890e173f1a3d41c823dde7bf5', {
            method: 'GET',
            headers: {
                Accept: 'application/json',
                'Coder-Session-Token': 'https://api.coder.com',
            },
        })
    })

    it('should create user when user does not exist (400 status)', async () => {
        const mockUserResponse = { id: 'user123', name: 'John Doe' }
        const mockFetch = global.fetch as unknown as Mock
        // Mock the fetch calls in the right order:
        // 1. First fetch - check if user exists (returns 400)
        // 2. Second fetch - get organizations (for createCoderUser)
        // 3. Third fetch - create user (returns success)
        mockFetch
            .mockResolvedValueOnce({
                ok: false,
                status: 400,
                text: vi.fn().mockResolvedValue('User not found'),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: vi.fn().mockResolvedValue([{ id: 'org', name: 'coder' }]),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: vi.fn().mockResolvedValue(mockUserResponse),
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
        expect(result).toEqual(mockUserResponse)
        // Verify the POST call to create user was made
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
                username: '11bb52890e173f1a3d41c823dde7bf5',
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

        await expect(getOrCreateCoderUser('study123')).rejects.toThrow('Failed to get user: 500 Internal server error')
    })
})

describe('createUserAndWorkspace', () => {
    const ORIGINAL_ENV = process.env

    beforeEach(() => {
        process.env = { ...ORIGINAL_ENV }
        vi.resetAllMocks()
        global.fetch = vi.fn()
    })

    afterEach(() => {
        process.env = ORIGINAL_ENV
    })

    it('should create user and workspace successfully', async () => {
        const mockUserResponse = { id: 'user123', name: 'John Doe' }
        const mockWorkspaceResponse = { id: 'workspace123', name: 'test-workspace' }
        const mockFetch = global.fetch as unknown as Mock
        mockFetch
            .mockResolvedValueOnce({
                ok: true,
                json: vi.fn().mockResolvedValue(mockUserResponse),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: vi.fn().mockResolvedValue(mockWorkspaceResponse),
            })

        getConfigValueMock.mockResolvedValue('https://api.coder.com')
        getStudyAndOrgDisplayInfoMock.mockResolvedValue({
            researcherEmail: 'john@example.com',
            researcherId: 'user123',
        })

        const result = await createUserAndWorkspace('study123')
        expect(result).toEqual({
            success: true,
            workspace: mockWorkspaceResponse,
        })
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

        await expect(createUserAndWorkspace('study123')).rejects.toThrow(
            'Failed to create user and workspace: Failed to get user: 500 Internal server error',
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

describe('uuidToStr', () => {
    it('should handle md5hash case with UUID', () => {
        const uuid = '550e8400-e29b-41d4-a716-446655440000'
        const result = generateWorkspaceName(uuid)
        expect(result).toBe('140f39b05a')
    })

    it('should handle md5hash case with UUID without hyphens', () => {
        const uuid = '550e8400e29b41d4a716446655440000'
        const result = generateWorkspaceName(uuid)
        expect(result).toBe('140f39b05a')
    })

    it('should handle md5hash case with UUID with mixed case', () => {
        const uuid = '550E8400-E29B-41D4-A716-446655440000'
        const result = generateWorkspaceName(uuid)
        expect(result).toBe('140f39b05a')
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
