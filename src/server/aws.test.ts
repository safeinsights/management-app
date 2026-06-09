import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import {
    buildTriggerBuildImageCommandInput,
    buildTriggerScanForStudyJobCommandInput,
    sanitizeColumnName,
    testDataBucketName,
    toAthenaDbName,
    toPgDbName,
} from './aws'

// The CodeBuild triggers in aws.ts construct a `StartBuildCommand` from a
// pure builder and send it. We test the builders directly (which is what
// actually has any logic worth verifying) rather than try to mock out the
// AWS SDK — vitest cannot reliably intercept `@aws-sdk/*` imports across the
// externalised CJS boundary, so any attempt to test the wrapping triggers
// would either skip the assertions or trip a real network call.
//
// `getConfigValue` reads `process.env[key]` before consulting Secrets Manager,
// so setting `CODEBUILD_WEBHOOK_SECRET` in test env yields predictable output
// without needing to mock the config module (which has the same externalised-
// dependency mocking issue as @aws-sdk/*).

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

describe('buildTriggerBuildImageCommandInput', () => {
    const originalEnv = process.env

    beforeEach(() => {
        process.env = {
            ...originalEnv,
            CONTAINERIZER_PROJECT_NAME: 'TestCodeBuildProject',
            ENVIRONMENT_ID: 'test',
            CODEBUILD_WEBHOOK_SECRET: 'mock-webhook-secret',
        }
    })

    afterEach(() => {
        process.env = originalEnv
    })

    it('produces the expected CodeBuild input for a build-image job', async () => {
        const info = {
            studyJobId: 'job-123',
            codeEnvURL: 'docker.io/my-base-image:latest',
            codeEntryPointFileName: 'main.R',
            containerLocation: 'a-bad-url',
            cmdLine: 'Rscript %f --arg1 value1',
            studyId: 'study-abc',
            orgSlug: 'org-xyz',
        }

        const input = await buildTriggerBuildImageCommandInput(info)

        expect(input.projectName).toBe('TestCodeBuildProject')

        const expectedEnvVars = [
            { name: 'WEBHOOK_SECRET', value: 'mock-webhook-secret' },
            { name: 'WEBHOOK_ENDPOINT', value: '/api/services/containerizer' },
            {
                name: 'ON_START_PAYLOAD',
                value: JSON.stringify({ jobId: info.studyJobId, status: 'JOB-PACKAGING' }),
            },
            {
                name: 'ON_SUCCESS_PAYLOAD',
                value: JSON.stringify({ jobId: info.studyJobId, status: 'JOB-READY' }),
            },
            {
                name: 'ON_FAILURE_PAYLOAD',
                value: JSON.stringify({ jobId: info.studyJobId, status: 'JOB-ERRORED' }),
            },
            { name: 'STUDY_JOB_ID', value: info.studyJobId },
            { name: 'S3_PATH', value: 'studies/org-xyz/study-abc/jobs/job-123/code' },
            { name: 'DOCKER_BASE_IMAGE_LOCATION', value: info.codeEnvURL },
            { name: 'DOCKER_CMD_LINE', value: 'Rscript main.R --arg1 value1' },
            { name: 'DOCKER_CODE_LOCATION', value: 'a-bad-url:job-123' },
        ]

        expect(input.environmentVariablesOverride).toEqual(expect.arrayContaining(expectedEnvVars))
        expect(input.environmentVariablesOverride.length).toBe(expectedEnvVars.length)
    })
})

describe('buildTriggerScanForStudyJobCommandInput', () => {
    const originalEnv = process.env

    beforeEach(() => {
        process.env = {
            ...originalEnv,
            SCANNER_PROJECT_NAME: 'TestScannerProject',
            ENVIRONMENT_ID: 'test',
            CODEBUILD_WEBHOOK_SECRET: 'mock-webhook-secret',
        }
    })

    afterEach(() => {
        process.env = originalEnv
    })

    it('produces the expected CodeBuild input for a source scan', async () => {
        const info = { studyJobId: 'job-456', studyId: 'study-abc', orgSlug: 'org-xyz' }

        const input = await buildTriggerScanForStudyJobCommandInput(info)

        expect(input.projectName).toBe('TestScannerProject')

        const expectedEnvVars = [
            { name: 'WEBHOOK_SECRET', value: 'mock-webhook-secret' },
            { name: 'WEBHOOK_ENDPOINT', value: '/api/services/job-scan-results' },
            {
                name: 'ON_SUCCESS_PAYLOAD',
                value: JSON.stringify({ jobId: info.studyJobId, status: 'CODE-SCANNED' }),
            },
            {
                // A failed source scan posts CODE-SCANNED, not JOB-ERRORED: the scan is advisory and
                // a human reviewer decides. See buildTriggerScanForStudyJobCommandInput.
                name: 'ON_FAILURE_PAYLOAD',
                value: JSON.stringify({ jobId: info.studyJobId, status: 'CODE-SCANNED' }),
            },
            { name: 'SCAN_MODE', value: 'source' },
            { name: 'STUDY_JOB_ID', value: info.studyJobId },
            { name: 'S3_PATH', value: 'studies/org-xyz/study-abc/jobs/job-456/code' },
            { name: 'ARTIFACTS_PATH', value: 'scan-artifacts/jobs/job-456' },
        ]

        expect(input.environmentVariablesOverride).toEqual(expect.arrayContaining(expectedEnvVars))
        expect(input.environmentVariablesOverride.length).toBe(expectedEnvVars.length)

        // The scan must NOT post a status on start: a CODE-SUBMITTED echo here would reopen a
        // round that a reviewer may have already decided. See buildTriggerScanForStudyJobCommandInput.
        expect(input.environmentVariablesOverride.some((v) => v.name === 'ON_START_PAYLOAD')).toBe(false)
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
