import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { triggerBuildImageForJob } from './aws'
import { CodeBuildClient, StartBuildCommand } from '@aws-sdk/client-codebuild'

// Mock the AWS SDK CodeBuildClient and StartBuildCommand
vi.mock('@aws-sdk/client-codebuild', () => {
    const mockSend = vi.fn(() => ({ build: { id: 'mock-build-id' } }))
    const mockCodeBuildClient = vi.fn(() => ({
        send: mockSend,
    }))
    return {
        CodeBuildClient: mockCodeBuildClient,
        StartBuildCommand: vi.fn(), // Mock StartBuildCommand constructor
    }
})

describe('triggerBuildImageForJob', () => {
    const originalEnv = process.env

    beforeEach(() => {
        process.env = {
            ...originalEnv,
            CODE_BUILD_PROJECT_NAME: 'TestCodeBuildProject',
            ENVIRONMENT_ID: 'test',
        }
    })

    afterEach(() => {
        process.env = originalEnv
    })

    it('should trigger a CodeBuild job with correct parameters', async () => {
        const mockJobInfo = {
            studyJobId: 'job-123',
            baseImageURL: 'docker.io/my-base-image:latest',
            codeEntryPointFileName: 'main.R',
            containerLocation: 'a-bad-url',
            cmdLine: 'Rscript %f --arg1 value1',
            studyId: 'study-abc',
            orgSlug: 'org-xyz',
        }

        await triggerBuildImageForJob(mockJobInfo)

        expect(CodeBuildClient).toHaveBeenCalledTimes(1)
        expect(CodeBuildClient).toHaveBeenCalledWith({})

        expect(StartBuildCommand).toHaveBeenCalledTimes(1)
        const startBuildCommandArgs = (StartBuildCommand as unknown as Mock).mock.calls[0][0]

        expect(startBuildCommandArgs.projectName).toBe('TestCodeBuildProject')

        // Assert environment variables
        const expectedEnvVars = [
            {
                name: 'ON_START_PAYLOAD',
                value: JSON.stringify({
                    jobId: mockJobInfo.studyJobId,
                    status: 'JOB-PACKAGING',
                }),
            },
            {
                name: 'ON_SUCCESS_PAYLOAD',
                value: JSON.stringify({
                    jobId: mockJobInfo.studyJobId,
                    status: 'JOB-READY',
                }),
            },
            { name: 'S3_PATH', value: 'studies/org-xyz/study-abc/jobs/job-123/code' },
            { name: 'DOCKER_BASE_IMAGE_LOCATION', value: mockJobInfo.baseImageURL },
            { name: 'DOCKER_CMD_LINE', value: 'Rscript main.R --arg1 value1' }, // %f replaced
            { name: 'DOCKER_CODE_LOCATION', value: `a-bad-url:job-123` },
        ]

        expect(startBuildCommandArgs.environmentVariablesOverride).toEqual(expect.arrayContaining(expectedEnvVars))
        expect(startBuildCommandArgs.environmentVariablesOverride.length).toBe(expectedEnvVars.length)

        // Assert that send was called on the client
        const codeBuildClientInstance = (CodeBuildClient as unknown as Mock).mock.results[0].value
        expect(codeBuildClientInstance.send).toHaveBeenCalledTimes(1)
        expect(codeBuildClientInstance.send).toHaveBeenCalledWith(expect.any(StartBuildCommand))
    })
})
