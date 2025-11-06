import { uuidToStr } from '@/lib/utils'
import { currentUser } from '@clerk/nextjs/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createUserAndWorkspace, generateWorkspaceUrl } from './coder'
import { getConfigValue } from './config'

// Mock the dependencies
vi.mock('./config', () => ({
    getConfigValue: vi.fn(),
}))

vi.mock('@/lib/paths', () => ({
    coderUserInfoPath: vi.fn().mockReturnValue('/api/users/username'),
    coderUsersPath: vi.fn().mockReturnValue('/api/users'),
    coderWorkspaceBuildPath: vi.fn().mockReturnValue('/api/workspace/build'),
    coderWorkspaceCreatePath: vi.fn().mockReturnValue('/api/workspace/create'),
    coderWorkspaceDataPath: vi.fn().mockReturnValue('/api/workspace/data'),
    coderWorkspacePath: vi.fn().mockReturnValue('/api/workspace/path'),
}))

vi.mock('@/lib/utils', () => ({
    uuidToStr: vi.fn(),
}))

vi.mock('@clerk/nextjs/server', () => ({
    currentUser: vi.fn(),
}))

describe('generateWorkspaceUrl', () => {
    beforeEach(() => {
        vi.resetAllMocks()
    })

    it('should generate a correct workspace URL', async () => {
        // Mock the configuration values
        vi.mocked(getConfigValue).mockResolvedValueOnce('https://coder.example.com') // CODER_API_ENDPOINT

        // Mock uuidToStr to return a predictable value
        vi.mocked(uuidToStr).mockReturnValue('testworkspace')

        // Mock coderWorkspacePath to return a predictable path
        vi.mocked((await import('@/lib/paths')).coderWorkspacePath).mockReturnValue('/api/workspaces/testworkspace')

        const result = await generateWorkspaceUrl('test-study-id', 'testuser')

        expect(result).toBe('https://coder.example.com/api/workspaces/testworkspace')
    })

    it('should handle different study IDs and user names', async () => {
        // Mock the configuration values
        vi.mocked(getConfigValue).mockResolvedValueOnce('https://coder.example.com') // CODER_API_ENDPOINT

        // Mock uuidToStr with different values
        vi.mocked(uuidToStr).mockReturnValue('differentworkspace')

        // Mock coderWorkspacePath with different values
        vi.mocked((await import('@/lib/paths')).coderWorkspacePath).mockReturnValue(
            '/api/workspaces/differentworkspace',
        )

        const result = await generateWorkspaceUrl('different-study-id', 'differentuser')

        expect(result).toBe('https://coder.example.com/api/workspaces/differentworkspace')
    })

    it('should handle API endpoint with trailing slash', async () => {
        // Mock the configuration values with trailing slash
        vi.mocked(getConfigValue).mockResolvedValueOnce('https://coder.example.com/') // CODER_API_ENDPOINT

        // Mock uuidToStr
        vi.mocked(uuidToStr).mockReturnValue('testworkspace')

        // Import the actual paths module to test the real path construction
        const pathsModule = await import('@/lib/paths')

        // Mock coderWorkspacePath to return the actual path structure
        vi.mocked(pathsModule.coderWorkspacePath).mockReturnValue('@testuser/testworkspace.main/apps/code-server')

        const result = await generateWorkspaceUrl('test-study-id', 'testuser')

        // The function should handle trailing slashes properly - no double slashes
        expect(result).toBe('https://coder.example.com/@testuser/testworkspace.main/apps/code-server')
    })

    it('should throw error when API endpoint is not configured', async () => {
        // Mock getConfigValue to throw an error
        vi.mocked(getConfigValue).mockRejectedValue(new Error('Configuration not found'))

        await expect(generateWorkspaceUrl('test-study-id', 'testuser')).rejects.toThrow('Configuration not found')
    })
})

describe('createUserAndWorkspace', () => {
    beforeEach(() => {
        vi.resetAllMocks()
    })

    it('should throw error when user is not authenticated', async () => {
        vi.mocked(currentUser).mockResolvedValue(null)

        await expect(createUserAndWorkspace('Test User', 'test-study-id', 'test-user-id')).rejects.toThrow(
            'User not authenticated',
        )
    })

    it('should throw error when user does not have email', async () => {
        vi.mocked(currentUser).mockResolvedValue({
            primaryEmailAddress: null,
            emailAddresses: [],
        } as any) // eslint-disable-line @typescript-eslint/no-explicit-any

        await expect(createUserAndWorkspace('Test User', 'test-study-id', 'test-user-id')).rejects.toThrow(
            'User does not have an email address!',
        )
    })

    it('should create user and workspace when user does not exist', async () => {
        // Mock user not found scenario
        vi.mocked(currentUser).mockResolvedValue({
            primaryEmailAddress: { emailAddress: 'test@example.com' },
            id: 'test-user-id',
        } as any) // eslint-disable-line @typescript-eslint/no-explicit-any

        vi.mocked(getConfigValue)
            .mockResolvedValueOnce('https://coder.example.com') // CODER_API_ENDPOINT
            .mockResolvedValueOnce('test-token') // CODER_TOKEN
            .mockResolvedValueOnce('test-template') // CODER_TEMPLATE_ID

        vi.mocked(uuidToStr).mockReturnValue('testworkspace')

        // Mock fetch responses for user not found case
        global.fetch = vi
            .fn()
            .mockResolvedValueOnce({
                ok: false,
                status: 400,
                text: vi.fn().mockResolvedValue('User not found'),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: vi.fn().mockResolvedValue({ id: 'test-user-id', name: 'testuser' }),
                text: vi.fn(),
            })
            .mockResolvedValueOnce({
                ok: false,
                status: 404,
                text: vi.fn().mockResolvedValue('Workspace not found'),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: vi.fn().mockResolvedValue({ id: 'test-workspace-id', name: 'testworkspace' }),
                text: vi.fn(),
            })

        const result = await createUserAndWorkspace('Test User', 'test-study-id', 'test-user-id')

        expect(result).toEqual({
            success: true,
            user: { id: 'test-user-id', name: 'testuser' },
            workspace: { id: 'test-workspace-id', name: 'testworkspace' },
            workspaceName: 'testworkspace',
        })
    })

    it('should return existing user and workspace when they exist', async () => {
        // Mock existing user scenario
        vi.mocked(currentUser).mockResolvedValue({
            primaryEmailAddress: { emailAddress: 'test@example.com' },
            id: 'test-user-id',
        } as any) // eslint-disable-line @typescript-eslint/no-explicit-any

        vi.mocked(getConfigValue)
            .mockResolvedValueOnce('https://coder.example.com') // CODER_API_ENDPOINT
            .mockResolvedValueOnce('test-token') // CODER_TOKEN
            .mockResolvedValueOnce('test-template') // CODER_TEMPLATE_ID

        vi.mocked(uuidToStr).mockReturnValue('testworkspace')

        // Mock fetch responses for existing user and workspace
        global.fetch = vi
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                json: vi.fn().mockResolvedValue({ id: 'test-user-id', name: 'testuser' }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: vi.fn().mockResolvedValue({
                    latest_build: { status: 'running' },
                    id: 'test-workspace-id',
                    name: 'testworkspace',
                }),
            })

        const result = await createUserAndWorkspace('Test User', 'test-study-id', 'test-user-id')

        expect(result).toEqual({
            success: true,
            workspaceName: 'testworkspace',
            workspace: {
                latest_build: { status: 'running' },
                id: 'test-workspace-id',
                name: 'testworkspace',
            },
        })
    })

    it('should start workspace when it is stopped', async () => {
        // Mock existing user scenario
        vi.mocked(currentUser).mockResolvedValue({
            primaryEmailAddress: { emailAddress: 'test@example.com' },
            id: 'test-user-id',
        } as any) // eslint-disable-line @typescript-eslint/no-explicit-any

        vi.mocked(getConfigValue)
            .mockResolvedValueOnce('https://coder.example.com') // CODER_API_ENDPOINT
            .mockResolvedValueOnce('test-token') // CODER_TOKEN
            .mockResolvedValueOnce('test-template') // CODER_TEMPLATE_ID

        vi.mocked(uuidToStr).mockReturnValue('testworkspace')

        // Mock fetch responses for existing user and stopped workspace
        global.fetch = vi
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                json: vi.fn().mockResolvedValue({ id: 'test-user-id', name: 'testuser' }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: vi.fn().mockResolvedValue({
                    latest_build: { status: 'stopped' },
                    id: 'test-workspace-id',
                    name: 'testworkspace',
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                text: vi.fn(),
            })

        const result = await createUserAndWorkspace('Test User', 'test-study-id', 'test-user-id')

        expect(result).toEqual({
            success: true,
            workspaceName: 'testworkspace',
            workspace: {
                latest_build: { status: 'stopped' },
                id: 'test-workspace-id',
                name: 'testworkspace',
            },
        })
    })

    it('should handle user creation error gracefully', async () => {
        vi.mocked(currentUser).mockResolvedValue({
            primaryEmailAddress: { emailAddress: 'test@example.com' },
            id: 'test-user-id',
        } as any) // eslint-disable-line @typescript-eslint/no-explicit-any

        vi.mocked(getConfigValue)
            .mockResolvedValueOnce('https://coder.example.com') // CODER_API_ENDPOINT
            .mockResolvedValueOnce('test-token') // CODER_TOKEN
            .mockResolvedValueOnce('test-template') // CODER_TEMPLATE_ID

        vi.mocked(uuidToStr).mockReturnValue('testworkspace')

        // Mock fetch responses for user creation error
        global.fetch = vi
            .fn()
            .mockResolvedValueOnce({
                ok: false,
                status: 400,
                text: vi.fn().mockResolvedValue('User not found'),
            })
            .mockResolvedValueOnce({
                ok: false,
                status: 400,
                text: vi.fn().mockResolvedValue('Failed to create user'),
            })

        await expect(createUserAndWorkspace('Test User', 'test-study-id', 'test-user-id')).rejects.toThrow(
            'Failed to create user: 400 Failed to create user',
        )
    })

    it('should handle workspace creation error gracefully', async () => {
        vi.mocked(currentUser).mockResolvedValue({
            primaryEmailAddress: { emailAddress: 'test@example.com' },
            id: 'test-user-id',
        } as any) // eslint-disable-line @typescript-eslint/no-explicit-any

        vi.mocked(getConfigValue)
            .mockResolvedValueOnce('https://coder.example.com') // CODER_API_ENDPOINT
            .mockResolvedValueOnce('test-token') // CODER_TOKEN
            .mockResolvedValueOnce('test-template') // CODER_TEMPLATE_ID

        vi.mocked(uuidToStr).mockReturnValue('testworkspace')

        // Mock fetch responses for user exists, workspace not found, workspace creation error
        global.fetch = vi
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                json: vi.fn().mockResolvedValue({ id: 'test-user-id', name: 'testuser' }),
            })
            .mockResolvedValueOnce({
                ok: false,
                status: 404,
                text: vi.fn().mockResolvedValue('Workspace not found'),
            })
            .mockResolvedValueOnce({
                ok: false,
                status: 500,
                text: vi.fn().mockResolvedValue('Failed to create workspace'),
            })

        await expect(createUserAndWorkspace('Test User', 'test-study-id', 'test-user-id')).rejects.toThrow(
            'Failed to create workspace: 500 Failed to create workspace',
        )
    })
})
