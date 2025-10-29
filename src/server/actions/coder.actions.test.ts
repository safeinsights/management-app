import { actionResult } from '@/tests/unit.helpers'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { checkWorkspaceExistsAction, createUserAndWorkspaceAction, getStudyWorkspaceUrlAction } from './coder.actions'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock process.env
const originalEnv = process.env

describe('coder.actions', () => {
    beforeEach(() => {
        // Reset mocks
        vi.resetAllMocks()
        // Restore original environment
        process.env = { ...originalEnv }
    })

    afterEach(() => {
        process.env = originalEnv
    })

    describe('getStudyWorkspaceUrl', () => {
        it('should generate correct workspace URL with valid inputs', async () => {
            process.env.CODER_API_ENDPOINT = 'https://coder.example.com'
            const result = await getStudyWorkspaceUrlAction({
                userId: 'user123',
                studyId: 'study456',
                email: 'test@example.com',
            })

            expect(result).toEqual({
                url: 'https://coder.example.com/@test/study456.main/apps/code-server',
            })
        })

        it('should throw error when CODER_API_ENDPOINT is not set', async () => {
            delete process.env.CODER_API_ENDPOINT

            await expect(
                getStudyWorkspaceUrlAction({
                    userId: 'user123',
                    studyId: 'study456',
                    email: 'test@example.com',
                }),
            ).rejects.toThrow('CODER_API_ENDPOINT environment variable is not set')
        })

        it('should handle email with special characters in username', async () => {
            process.env.CODER_API_ENDPOINT = 'https://coder.example.com'

            const response = await getStudyWorkspaceUrlAction({
                userId: 'user123',
                studyId: 'study456',
                email: 'test.email+tag@example.com',
            })

            const result = actionResult(response)

            expect(result).toEqual({
                url: 'https://coder.example.com/@testemailtag/study456.main/apps/code-server',
            })
        })

        it('should truncate username when it exceeds 32 characters', async () => {
            process.env.CODER_API_ENDPOINT = 'https://coder.example.com'

            const longEmail = 'a'.repeat(50) + '@example.com'
            const response = await getStudyWorkspaceUrlAction({
                userId: 'user123',
                studyId: 'study456',
                email: longEmail,
            })

            const result = actionResult(response)

            // Should truncate to 31 characters (less than 32)
            expect(result.url).toContain('https://coder.example.com/@')
            expect(result.url).toContain('/study456.main/apps/code-server')
        })
    })

    describe('checkWorkspaceExists', () => {
        it('should return exists: true when workspace exists (200 OK)', async () => {
            process.env.CODER_API_ENDPOINT = 'https://coder.example.com'
            process.env.CODER_TOKEN = 'test-token'

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: vi.fn().mockResolvedValue({ id: 'workspace123', name: 'test-workspace' }),
            })

            const result = await checkWorkspaceExistsAction({
                email: 'test@example.com',
                userId: 'user123',
                studyId: 'study456',
            })

            expect(result).toEqual({
                exists: true,
                data: { id: 'workspace123', name: 'test-workspace' },
            })
            expect(mockFetch).toHaveBeenCalledWith(
                'https://coder.example.com/api/v2/users/test/study456/workspace/test-workspace',
                {
                    method: 'GET',
                    headers: {
                        Accept: 'application/json',
                        'Coder-Session-Token': 'test-token',
                    },
                },
            )
        })

        it('should return exists: false when workspace does not exist (404)', async () => {
            process.env.CODER_API_ENDPOINT = 'https://coder.example.com'
            process.env.CODER_TOKEN = 'test-token'

            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
                json: vi.fn().mockResolvedValue({ error: 'not found' }),
            })

            const result = await checkWorkspaceExistsAction({
                email: 'test@example.com',
                userId: 'user123',
                studyId: 'study456',
            })

            expect(result).toEqual({
                exists: false,
                data: undefined,
            })
        })

        it('should return exists: false when fetch throws error', async () => {
            process.env.CODER_API_ENDPOINT = 'https://coder.example.com'
            process.env.CODER_TOKEN = 'test-token'

            mockFetch.mockRejectedValueOnce(new Error('Network error'))

            const result = await checkWorkspaceExistsAction({
                email: 'test@example.com',
                userId: 'user123',
                studyId: 'study456',
            })

            expect(result).toEqual({
                exists: false,
                data: undefined,
            })
        })

        it('should throw error when CODER_API_ENDPOINT is not set', async () => {
            delete process.env.CODER_API_ENDPOINT
            process.env.CODER_TOKEN = 'test-token'

            await expect(
                checkWorkspaceExistsAction({
                    email: 'test@example.com',
                    userId: 'user123',
                    studyId: 'study456',
                }),
            ).rejects.toThrow('CODER_API_ENDPOINT environment variable is not set')
        })

        it('should throw error when CODER_TOKEN is not set', async () => {
            process.env.CODER_API_ENDPOINT = 'https://coder.example.com'
            delete process.env.CODER_TOKEN

            await expect(
                checkWorkspaceExistsAction({
                    email: 'test@example.com',
                    userId: 'user123',
                    studyId: 'study456',
                }),
            ).rejects.toThrow('CODER_TOKEN environment variable is not set')
        })
    })

    describe('createUserAndWorkspace', () => {
        it('should create user and workspace successfully', async () => {
            process.env.CODER_API_ENDPOINT = 'https://coder.example.com'
            process.env.CODER_TOKEN = 'test-token'
            process.env.CODER_TEMPLATE_ID = 'template123'
            process.env.CODER_ORGANIZATION = 'org456'

            // Mock user GET request (user doesn't exist)
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 400,
            })

            // Mock user creation
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: vi.fn().mockResolvedValue({ id: 'user123', name: 'Test User', email: 'test@example.com' }),
            })

            // Mock workspace creation
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: vi.fn().mockResolvedValue({ id: 'workspace123', name: 'test-workspace' }),
            })

            const result = await createUserAndWorkspaceAction({
                name: 'Test User',
                userId: 'user123',
                email: 'test@example.com',
                studyId: 'study456',
            })

            expect(result).toEqual({
                success: true,
                user: { id: 'user123', name: 'Test User', email: 'test@example.com' },
                workspace: { id: 'workspace123', name: 'test-workspace' },
                workspaceName: 'study456',
            })
        })

        it('should handle existing user case', async () => {
            process.env.CODER_API_ENDPOINT = 'https://coder.example.com'
            process.env.CODER_TOKEN = 'test-token'
            process.env.CODER_TEMPLATE_ID = 'template123'
            process.env.CODER_ORGANIZATION = 'org456'

            // Mock user GET request (user exists)
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: vi.fn().mockResolvedValue({ id: 'user123', name: 'Test User', email: 'test@example.com' }),
            })

            // Mock workspace creation
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: vi.fn().mockResolvedValue({ id: 'workspace123', name: 'test-workspace' }),
            })

            const result = await createUserAndWorkspaceAction({
                name: 'Test User',
                userId: 'user123',
                email: 'test@example.com',
                studyId: 'study456',
            })

            expect(result).toEqual({
                success: true,
                user: { id: 'user123', name: 'Test User', email: 'test@example.com' },
                workspace: { id: 'workspace123', name: 'test-workspace' },
                workspaceName: 'study456',
            })
        })

        it('should throw error when user creation fails', async () => {
            process.env.CODER_API_ENDPOINT = 'https://coder.example.com'
            process.env.CODER_TOKEN = 'test-token'
            process.env.CODER_TEMPLATE_ID = 'template123'
            process.env.CODER_ORGANIZATION = 'org456'

            // Mock user GET request (user doesn't exist)
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 400,
            })

            // Mock user creation failure
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 400,
                text: vi.fn().mockResolvedValue('User already exists'),
            })

            await expect(
                createUserAndWorkspaceAction({
                    name: 'Test User',
                    userId: 'user123',
                    email: 'test@example.com',
                    studyId: 'study456',
                }),
            ).rejects.toThrow('Failed to create user: 400 User already exists')
        })

        it('should throw error when workspace creation fails', async () => {
            process.env.CODER_API_ENDPOINT = 'https://coder.example.com'
            process.env.CODER_TOKEN = 'test-token'
            process.env.CODER_TEMPLATE_ID = 'template123'
            process.env.CODER_ORGANIZATION = 'org456'

            // Mock user GET request (user doesn't exist)
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 400,
            })

            // Mock user creation
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: vi.fn().mockResolvedValue({ id: 'user123', name: 'Test User', email: 'test@example.com' }),
            })

            // Mock workspace creation failure
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 400,
                text: vi.fn().mockResolvedValue('Workspace creation failed'),
            })

            await expect(
                createUserAndWorkspaceAction({
                    name: 'Test User',
                    userId: 'user123',
                    email: 'test@example.com',
                    studyId: 'study456',
                }),
            ).rejects.toThrow('Failed to create workspace: 400 Workspace creation failed')
        })

        it('should throw error when CODER_API_ENDPOINT is not set', async () => {
            delete process.env.CODER_API_ENDPOINT
            process.env.CODER_TOKEN = 'test-token'
            process.env.CODER_TEMPLATE_ID = 'template123'
            process.env.CODER_ORGANIZATION = 'org456'

            await expect(
                createUserAndWorkspaceAction({
                    name: 'Test User',
                    userId: 'user123',
                    email: 'test@example.com',
                    studyId: 'study456',
                }),
            ).rejects.toThrow('CODER_API_ENDPOINT environment variable is not set')
        })

        it('should throw error when CODER_TOKEN is not set', async () => {
            process.env.CODER_API_ENDPOINT = 'https://coder.example.com'
            delete process.env.CODER_TOKEN
            process.env.CODER_TEMPLATE_ID = 'template123'
            process.env.CODER_ORGANIZATION = 'org456'

            await expect(
                createUserAndWorkspaceAction({
                    name: 'Test User',
                    userId: 'user123',
                    email: 'test@example.com',
                    studyId: 'study456',
                }),
            ).rejects.toThrow('CODER_TOKEN environment variable is not set')
        })

        it('should throw error when CODER_TEMPLATE_ID is not set', async () => {
            process.env.CODER_API_ENDPOINT = 'https://coder.example.com'
            process.env.CODER_TOKEN = 'test-token'
            delete process.env.CODER_TEMPLATE_ID
            process.env.CODER_ORGANIZATION = 'org456'

            await expect(
                createUserAndWorkspaceAction({
                    name: 'Test User',
                    userId: 'user123',
                    email: 'test@example.com',
                    studyId: 'study456',
                }),
            ).rejects.toThrow('CODER_TEMPLATE_ID environment variable is not set')
        })

        it('should throw error when CODER_ORGANIZATION is not set', async () => {
            process.env.CODER_API_ENDPOINT = 'https://coder.example.com'
            process.env.CODER_TOKEN = 'test-token'
            process.env.CODER_TEMPLATE_ID = 'template123'
            delete process.env.CODER_ORGANIZATION

            await expect(
                createUserAndWorkspaceAction({
                    name: 'Test User',
                    userId: 'user123',
                    email: 'test@example.com',
                    studyId: 'study456',
                }),
            ).rejects.toThrow('CODER_ORGANIZATION environment variable is not set')
        })
    })
})
