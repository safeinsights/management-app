import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts'
import { CodeBuildClient, StartBuildCommand } from '@aws-sdk/client-codebuild'
import { ENVIRONMENT_ID, TEST_ENV, getConfigValue } from '../config'
import { pathForCodeEnvScanArtifacts, pathForJobScanArtifacts, pathForStudyJobCode } from '@/lib/paths'
import { substituteEntryPointFile } from '@/lib/string'
import { MinimalJobInfo, MinimalStudyInfo } from '@/lib/types'
import { withS3Prefix } from './s3'

export async function codeBuildRepositoryUrl(info: MinimalStudyInfo) {
    return process.env.CODE_BUILD_REPOSITORY_DOMAIN + `/${info.orgSlug}/code-builds/${ENVIRONMENT_ID}`
}

export const getAWSInfo = async () => {
    const region = process.env.AWS_REGION || 'us-east-1'
    if (TEST_ENV) {
        return { accountId: '000000000000', region }
    }
    if (process.env.AWS_ACCOUNT_ID) {
        return { accountId: process.env.AWS_ACCOUNT_ID, region }
    }
    const client = new STSClient({})
    const command = new GetCallerIdentityCommand({})
    const response = await client.send(command)
    const accountId = response.Account
    if (!accountId) throw new Error('Failed to get AWS account ID')

    return {
        accountId,
        region,
    }
}

async function buildCodeBuildEnvVars(webhookEndpoint: string, vars: Record<string, string | object>) {
    return Object.entries({
        WEBHOOK_SECRET: await getConfigValue('CODEBUILD_WEBHOOK_SECRET'),
        WEBHOOK_ENDPOINT: webhookEndpoint,
        // The CodeBuild project's default is the base environment's domain, so a PR preview's
        // webhooks would otherwise land on an app whose database does not have the job.
        ...(process.env.DOMAIN_NAME && { ASSIGNED_DOMAIN: process.env.DOMAIN_NAME }),
        ...vars,
    }).map(([name, value]) => ({ name, value: typeof value === 'object' ? JSON.stringify(value) : value }))
}

// Exported so tests can verify the inputs without mocking the AWS SDK, which vitest cannot do
// across its externalised CJS resolution boundary.
export async function buildTriggerBuildImageCommandInput(
    info: MinimalJobInfo & {
        codeEnvURL: string
        codeEntryPointFileName: string
        cmdLine: string
        containerLocation: string
    },
) {
    // Shell-quotes the filename so metacharacters don't break the containerizer's /bin/sh (OTTER-477).
    const cmd = substituteEntryPointFile(info.cmdLine, info.codeEntryPointFileName)
    return {
        projectName: process.env.CONTAINERIZER_PROJECT_NAME || `MgmntAppContainerizer-${ENVIRONMENT_ID}`,
        environmentVariablesOverride: await buildCodeBuildEnvVars('/api/services/containerizer', {
            ON_START_PAYLOAD: { jobId: info.studyJobId, status: 'JOB-PACKAGING' },
            ON_SUCCESS_PAYLOAD: { jobId: info.studyJobId, status: 'JOB-READY' },
            ON_FAILURE_PAYLOAD: { jobId: info.studyJobId, status: 'JOB-ERRORED' },
            STUDY_JOB_ID: info.studyJobId,
            S3_PATH: withS3Prefix(pathForStudyJobCode(info)),
            DOCKER_CMD_LINE: cmd,
            DOCKER_BASE_IMAGE_LOCATION: info.codeEnvURL,
            DOCKER_CODE_LOCATION: `${info.containerLocation}:${info.studyJobId}`,
        }),
    }
}

export async function triggerBuildImageForJob(
    info: MinimalJobInfo & {
        codeEnvURL: string
        codeEntryPointFileName: string
        cmdLine: string
        containerLocation: string
    },
) {
    const codebuild = new CodeBuildClient({})
    const result = await codebuild.send(new StartBuildCommand(await buildTriggerBuildImageCommandInput(info)))
    if (!result.build) throw new Error(`failed to start packaging. requestID: ${result.$metadata.requestId}`)
}

// The scanner returns the payload it was given with its log merged in, so `round` travels to the
// build and back to the webhook untouched. A build that outlives its round is refused there, rather
// than reporting on code nobody is reviewing any more (OTTER-779).
export async function buildTriggerScanForStudyJobCommandInput(info: MinimalJobInfo & { round: number }) {
    return {
        projectName: process.env.SCANNER_PROJECT_NAME || `MgmntAppScanner-${ENVIRONMENT_ID}`,
        environmentVariablesOverride: await buildCodeBuildEnvVars('/api/services/job-scan-results', {
            // No ON_START_PAYLOAD: a start webhook would re-post CODE-SUBMITTED, reopening a decided
            // round. A failed scan posts CODE-SCANNED too, since the scan is advisory.
            ON_SUCCESS_PAYLOAD: { jobId: info.studyJobId, status: 'CODE-SCANNED', round: info.round },
            ON_FAILURE_PAYLOAD: { jobId: info.studyJobId, status: 'CODE-SCANNED', round: info.round },
            SCAN_MODE: 'source',
            STUDY_JOB_ID: info.studyJobId,
            S3_PATH: withS3Prefix(pathForStudyJobCode(info)),
            ARTIFACTS_PATH: withS3Prefix(pathForJobScanArtifacts(info)),
        }),
    }
}

export async function triggerScanForStudyJob(info: MinimalJobInfo & { round: number }) {
    const codebuild = new CodeBuildClient({})
    const result = await codebuild.send(new StartBuildCommand(await buildTriggerScanForStudyJobCommandInput(info)))
    if (!result.build) throw new Error(`failed to start scan. requestID: ${result.$metadata.requestId}`)
}

export async function triggerScanForCodeEnv(info: { codeEnvId: string; imageUrl: string }) {
    const codebuild = new CodeBuildClient({})
    const result = await codebuild.send(
        new StartBuildCommand({
            projectName: process.env.SCANNER_PROJECT_NAME || `MgmntAppScanner-${ENVIRONMENT_ID}`,
            environmentVariablesOverride: await buildCodeBuildEnvVars('/api/services/code-env-scan-results', {
                ON_START_PAYLOAD: { codeEnvId: info.codeEnvId, status: 'SCAN-RUNNING' },
                ON_SUCCESS_PAYLOAD: { codeEnvId: info.codeEnvId, status: 'SCAN-COMPLETE' },
                ON_FAILURE_PAYLOAD: { codeEnvId: info.codeEnvId, status: 'SCAN-FAILED' },
                SCAN_MODE: 'image',
                CODE_ENV_ID: info.codeEnvId,
                DOCKER_IMAGE_URL: info.imageUrl,
                ARTIFACTS_PATH: withS3Prefix(pathForCodeEnvScanArtifacts(info)),
            }),
        }),
    )
    if (!result.build) throw new Error(`failed to start scan. requestID: ${result.$metadata.requestId}`)
}
