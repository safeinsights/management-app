import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import {
    buildTriggerBuildImageCommandInput,
    buildTriggerScanForStudyJobCommandInput,
    sanitizeColumnName,
    s3KeyPrefix,
    testDataBucketName,
    toAthenaDbName,
    toPgDbName,
    withS3Prefix,
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
            { name: 'DOCKER_CMD_LINE', value: "Rscript 'main.R' --arg1 value1" },
            { name: 'DOCKER_CODE_LOCATION', value: 'a-bad-url:job-123' },
        ]

        expect(input.environmentVariablesOverride).toEqual(expect.arrayContaining(expectedEnvVars))
        expect(input.environmentVariablesOverride.length).toBe(expectedEnvVars.length)
    })

    it('shell-quotes the entry-point filename so parentheses do not break the command (OTTER-477)', async () => {
        const info = {
            studyJobId: 'job-123',
            codeEnvURL: 'docker.io/my-base-image:latest',
            codeEntryPointFileName: 'main(1).r',
            containerLocation: 'a-bad-url',
            cmdLine: 'Rscript %f --arg1 value1',
            studyId: 'study-abc',
            orgSlug: 'org-xyz',
        }

        const input = await buildTriggerBuildImageCommandInput(info)

        const cmdLineVar = input.environmentVariablesOverride.find((v) => v.name === 'DOCKER_CMD_LINE')
        expect(cmdLineVar?.value).toBe("Rscript 'main(1).r' --arg1 value1")
    })

    it('substitutes and quotes every %f occurrence in the template', async () => {
        const input = await buildTriggerBuildImageCommandInput({
            studyJobId: 'job-123',
            codeEnvURL: 'docker.io/my-base-image:latest',
            codeEntryPointFileName: 'main(1).r',
            containerLocation: 'a-bad-url',
            cmdLine: 'cp %f /tmp/ && Rscript %f',
            studyId: 'study-abc',
            orgSlug: 'org-xyz',
        })

        const cmdLineVar = input.environmentVariablesOverride.find((v) => v.name === 'DOCKER_CMD_LINE')
        expect(cmdLineVar?.value).toBe("cp 'main(1).r' /tmp/ && Rscript 'main(1).r'")
    })

    it('does not double-quote when the env template already wraps %f in double quotes (OTTER-477 follow-up)', async () => {
        const input = await buildTriggerBuildImageCommandInput({
            studyJobId: 'job-123',
            codeEnvURL: 'docker.io/my-base-image:latest',
            codeEntryPointFileName: 'main_revised (1).R',
            containerLocation: 'a-bad-url',
            cmdLine: 'Rscript "%f"',
            studyId: 'study-abc',
            orgSlug: 'org-xyz',
        })

        const cmdLineVar = input.environmentVariablesOverride.find((v) => v.name === 'DOCKER_CMD_LINE')
        expect(cmdLineVar?.value).toBe("Rscript 'main_revised (1).R'")
    })

    it('does not re-expose parens when the env template already wraps %f in single quotes', async () => {
        const input = await buildTriggerBuildImageCommandInput({
            studyJobId: 'job-123',
            codeEnvURL: 'docker.io/my-base-image:latest',
            codeEntryPointFileName: 'main(1).r',
            containerLocation: 'a-bad-url',
            cmdLine: "Rscript '%f'",
            studyId: 'study-abc',
            orgSlug: 'org-xyz',
        })

        const cmdLineVar = input.environmentVariablesOverride.find((v) => v.name === 'DOCKER_CMD_LINE')
        expect(cmdLineVar?.value).toBe("Rscript 'main(1).r'")
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

describe('S3_KEY_PREFIX', () => {
    const originalEnv = process.env.S3_KEY_PREFIX

    afterEach(() => {
        if (originalEnv !== undefined) {
            process.env.S3_KEY_PREFIX = originalEnv
        } else {
            delete process.env.S3_KEY_PREFIX
        }
    })

    describe('when unset or empty', () => {
        it('s3KeyPrefix returns an empty string', () => {
            delete process.env.S3_KEY_PREFIX
            expect(s3KeyPrefix()).toBe('')
            process.env.S3_KEY_PREFIX = ''
            expect(s3KeyPrefix()).toBe('')
        })

        it('withS3Prefix leaves the key unchanged', () => {
            delete process.env.S3_KEY_PREFIX
            expect(withS3Prefix('studies/org/study')).toBe('studies/org/study')
        })
    })

    describe('when set', () => {
        it('normalizes to exactly one trailing slash and no leading slash', () => {
            process.env.S3_KEY_PREFIX = 'staging'
            expect(s3KeyPrefix()).toBe('staging/')
            process.env.S3_KEY_PREFIX = '/staging/'
            expect(s3KeyPrefix()).toBe('staging/')
            process.env.S3_KEY_PREFIX = 'team/staging//'
            expect(s3KeyPrefix()).toBe('team/staging/')
        })

        it('withS3Prefix prepends the prefix to a logical key', () => {
            process.env.S3_KEY_PREFIX = 'staging'
            expect(withS3Prefix('studies/org/study')).toBe('staging/studies/org/study')
        })

        it('withS3Prefix is idempotent for an already-prefixed key', () => {
            process.env.S3_KEY_PREFIX = 'staging'
            expect(withS3Prefix('staging/studies/org/study')).toBe('staging/studies/org/study')
        })
    })

    it('flows the prefix into the CodeBuild S3_PATH and ARTIFACTS_PATH', async () => {
        process.env.S3_KEY_PREFIX = 'staging'
        process.env.SCANNER_PROJECT_NAME = 'TestScannerProject'
        process.env.CODEBUILD_WEBHOOK_SECRET = 'mock-webhook-secret'

        const input = await buildTriggerScanForStudyJobCommandInput({
            studyJobId: 'job-456',
            studyId: 'study-abc',
            orgSlug: 'org-xyz',
        })

        const byName = (name: string) => input.environmentVariablesOverride.find((v) => v.name === name)?.value
        expect(byName('S3_PATH')).toBe('staging/studies/org-xyz/study-abc/jobs/job-456/code')
        expect(byName('ARTIFACTS_PATH')).toBe('staging/scan-artifacts/jobs/job-456')
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
