import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest'
import {
    createUserAndWorkspace,
    generateUsername,
    getCoderOrganization,
    getCoderTemplateId,
    getCoderUser,
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

describe('generateUsername', () => {
    it('should generate username from email', () => {
        const email = 'john.doe@example.com'
        const userId = 'user123'
        const username = generateUsername(email, userId)
        expect(username).toBe('johndoe')
    })

    it('should handle email without @ symbol', () => {
        const email = 'john.doe'
        const userId = 'user123'
        const username = generateUsername(email, userId)
        expect(username).toBe('johndoe')
    })

    it('should handle email with special characters', () => {
        const email = 'john.doe+test@domain.com'
        const userId = 'user123'
        const username = generateUsername(email, userId)
        expect(username).toBe('johndoe')
    })

    it('should use userId when email is empty', () => {
        const email = ''
        const userId = 'user123'
        const username = generateUsername(email, userId)
        expect(username).toBe('user123')
    })

    it('should truncate username to 31 characters', () => {
        const email = 'a'.repeat(50) + '@example.com'
        const userId = 'user123'
        const username = generateUsername(email, userId)
        expect(username).toHaveLength(31)
    })

    it('should handle empty email and userId', () => {
        const email = ''
        const userId = ''
        const username = generateUsername(email, userId)
        expect(username).toBe('')
    })
})

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

        const result = await getCoderUser('study123')
        expect(result).toEqual(mockUserResponse)
        expect(mockFetch).toHaveBeenCalledWith('https://api.coder.com/api/v2/users/john', {
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
        // 2. Second fetch - create user (returns success)
        // 3. Third fetch - get organizations (this is what getCoderOrganization calls)
        mockFetch
            .mockResolvedValueOnce({
                ok: false,
                status: 400,
                text: vi.fn().mockResolvedValue('User not found'),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: vi.fn().mockResolvedValue(mockUserResponse),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: vi.fn().mockResolvedValue([
                    { id: 'org1', name: 'other-org' },
                    { id: 'org2', name: 'coder' },
                ]),
            })

        // Mock all the config values needed
        getConfigValueMock.mockResolvedValueOnce('https://api.coder.com') // CODER_API_ENDPOINT
        getConfigValueMock.mockResolvedValueOnce('https://api.coder.com') // CODER_TOKEN (for user creation)
        getConfigValueMock.mockResolvedValueOnce('https://api.coder.com') // CODER_TOKEN (for organization fetch)
        getStudyAndOrgDisplayInfoMock.mockResolvedValue({
            researcherEmail: 'john@example.com',
            researcherId: 'user123',
        })
        siUserMock.mockResolvedValue({
            id: 'user123',
            primaryEmailAddress: { emailAddress: 'john@example.com' },
            fullName: 'John Doe',
        })

        const result = await getCoderUser('study123')
        expect(result).toEqual(mockUserResponse)
        expect(mockFetch).toHaveBeenCalledWith('https://api.coder.com/api/v2/users', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'Coder-Session-Token': 'https://api.coder.com',
            },
            body: JSON.stringify({
                email: 'john@example.com',
                login_type: 'oidc',
                name: 'John Doe',
                username: 'johndoe',
                user_status: 'active',
                organization_ids: ['org2'],
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

        await expect(getCoderUser('study123')).rejects.toThrow('Failed to get user: 500 Internal server error')
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

        const result = await getCoderOrganization()
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

        await expect(getCoderOrganization()).rejects.toThrow('Failed to fetch organization data from Coder API')
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

        // Mock all three config calls that getCoderTemplateId makes
        getConfigValueMock.mockResolvedValueOnce('https://api.coder.com') // CODER_API_ENDPOINT
        getConfigValueMock.mockResolvedValueOnce('https://api.coder.com') // CODER_TOKEN
        getConfigValueMock.mockResolvedValueOnce('aws-fargate') // CODER_TEMPLATE (from .env)

        const result = await getCoderTemplateId()
        expect(result).toBe('template2')
        expect(mockFetch).toHaveBeenCalledWith('https://api.coder.com/api/v2/templates', {
            method: 'GET',
            headers: {
                Accept: 'application/json',
                'Coder-Session-Token': 'https://api.coder.com',
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
