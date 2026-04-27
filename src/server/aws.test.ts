import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import {
    triggerBuildImageForJob,
    triggerScanForStudyJob,
    toAthenaDbName,
    toPgDbName,
    sanitizeColumnName,
    testDataBucketName,
} from './aws'
import { CodeBuildClient, StartBuildCommand } from '@aws-sdk/client-codebuild'

vi.mock('./config', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./config')>()
    return { ...actual, getConfigValue: () => Promise.resolve('mock-webhook-secret') }
})

// Mock the AWS SDK CodeBuildClient and StartBuildCommand
vi.mock('@aws-sdk/client-codebuild', () => {
    const mockSend = vi.fn(() => ({ build: { id: 'mock-build-id' } }))
    const mockCodeBuildClient = vi.fn(function () {
        return { send: mockSend }
    })
    return {
        CodeBuildClient: mockCodeBuildClient,
        StartBuildCommand: vi.fn(), // Mock StartBuildCommand constructor
    }
})

describe('toAthenaDbName', () => {
    it('should replace dashes with underscores', () => {
        expect(toAthenaDbName('my-org', 'my-env')).toBe('my_org_my_env')
    })

    it('should leave names without dashes unchanged', () => {
        expect(toAthenaDbName('myorg', 'myenv')).toBe('myorg_myenv')
    })

    it('should handle multiple consecutive dashes', () => {
        expect(toAthenaDbName('org--name', 'env--id')).toBe('org__name_env__id')
    })
})

describe('toPgDbName', () => {
    it('should replace dashes with underscores', () => {
        expect(toPgDbName('my-org', 'my-env')).toBe('my_org_my_env')
    })

    it('should produce the same result as toAthenaDbName', () => {
        expect(toPgDbName('org-name', 'env-id')).toBe(toAthenaDbName('org-name', 'env-id'))
    })
})

describe('triggerBuildImageForJob', () => {
    const originalEnv = process.env

    beforeEach(() => {
        process.env = {
            ...originalEnv,
            CONTAINERIZER_PROJECT_NAME: 'TestCodeBuildProject',
            ENVIRONMENT_ID: 'test',
        }
    })

    afterEach(() => {
        process.env = originalEnv
    })

    it('should trigger a CodeBuild job with correct parameters', async () => {
        const mockJobInfo = {
            studyJobId: 'job-123',
            codeEnvURL: 'docker.io/my-base-image:latest',
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
                name: 'WEBHOOK_SECRET',
                value: 'mock-webhook-secret',
            },
            { name: 'WEBHOOK_ENDPOINT', value: '/api/services/containerizer' },
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
            {
                name: 'ON_FAILURE_PAYLOAD',
                value: JSON.stringify({
                    jobId: mockJobInfo.studyJobId,
                    status: 'JOB-ERRORED',
                }),
            },
            { name: 'STUDY_JOB_ID', value: mockJobInfo.studyJobId },
            { name: 'S3_PATH', value: 'studies/org-xyz/study-abc/jobs/job-123/code' },
            { name: 'DOCKER_BASE_IMAGE_LOCATION', value: mockJobInfo.codeEnvURL },
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

describe('triggerScanForStudyJob', () => {
    const originalEnv = process.env

    beforeEach(() => {
        process.env = {
            ...originalEnv,
            SCANNER_PROJECT_NAME: 'TestScannerProject',
            ENVIRONMENT_ID: 'test',
        }
        vi.clearAllMocks()
    })

    afterEach(() => {
        process.env = originalEnv
    })

    it('should trigger a source scan with correct parameters', async () => {
        const mockJobInfo = {
            studyJobId: 'job-456',
            studyId: 'study-abc',
            orgSlug: 'org-xyz',
        }

        await triggerScanForStudyJob(mockJobInfo)

        expect(CodeBuildClient).toHaveBeenCalledTimes(1)
        expect(CodeBuildClient).toHaveBeenCalledWith({})

        expect(StartBuildCommand).toHaveBeenCalledTimes(1)
        const startBuildCommandArgs = (StartBuildCommand as unknown as Mock).mock.calls[0][0]

        expect(startBuildCommandArgs.projectName).toBe('TestScannerProject')

        const expectedEnvVars = [
            { name: 'WEBHOOK_SECRET', value: 'mock-webhook-secret' },
            { name: 'WEBHOOK_ENDPOINT', value: '/api/services/job-scan-results' },
            {
                name: 'ON_START_PAYLOAD',
                value: JSON.stringify({ jobId: mockJobInfo.studyJobId, status: 'CODE-SUBMITTED' }),
            },
            {
                name: 'ON_SUCCESS_PAYLOAD',
                value: JSON.stringify({ jobId: mockJobInfo.studyJobId, status: 'CODE-SCANNED' }),
            },
            {
                name: 'ON_FAILURE_PAYLOAD',
                value: JSON.stringify({ jobId: mockJobInfo.studyJobId, status: 'JOB-ERRORED' }),
            },
            { name: 'SCAN_MODE', value: 'source' },
            { name: 'STUDY_JOB_ID', value: mockJobInfo.studyJobId },
            { name: 'S3_PATH', value: 'studies/org-xyz/study-abc/jobs/job-456/code' },
            { name: 'ARTIFACTS_PATH', value: 'scan-artifacts/jobs/job-456' },
        ]

        expect(startBuildCommandArgs.environmentVariablesOverride).toEqual(expect.arrayContaining(expectedEnvVars))
        expect(startBuildCommandArgs.environmentVariablesOverride.length).toBe(expectedEnvVars.length)

        const codeBuildClientInstance2 = (CodeBuildClient as unknown as Mock).mock.results[0].value
        expect(codeBuildClientInstance2.send).toHaveBeenCalledTimes(1)
        expect(codeBuildClientInstance2.send).toHaveBeenCalledWith(expect.any(StartBuildCommand))
    })
})

describe('sanitizeColumnName', () => {
    it('should lowercase and replace spaces with underscores', () => {
        expect(sanitizeColumnName('CLS GRADE AVG')).toBe('cls_grade_avg')
    })

    it('should collapse multiple underscores', () => {
        expect(sanitizeColumnName('col  name--here')).toBe('col_name_here')
    })

    it('should prefix col_ when starting with a digit', () => {
        expect(sanitizeColumnName('1st_column')).toBe('col_1st_column')
    })

    it('should prefix col_ when empty after sanitization', () => {
        expect(sanitizeColumnName('---')).toBe('col_')
    })

    it('should trim leading and trailing underscores', () => {
        expect(sanitizeColumnName(' hello ')).toBe('hello')
    })
})

describe('testDataBucketName', () => {
    const originalEnv = process.env.TEST_DATA_BUCKET_NAME

    afterEach(() => {
        if (originalEnv !== undefined) {
            process.env.TEST_DATA_BUCKET_NAME = originalEnv
        } else {
            delete process.env.TEST_DATA_BUCKET_NAME
        }
    })

    it('should return null when not configured', () => {
        delete process.env.TEST_DATA_BUCKET_NAME
        expect(testDataBucketName()).toBeNull()
    })

    it('should return the bucket name when configured', () => {
        process.env.TEST_DATA_BUCKET_NAME = 'safeinsights-test-data-s3-dev'
        expect(testDataBucketName()).toBe('safeinsights-test-data-s3-dev')
    })
})
