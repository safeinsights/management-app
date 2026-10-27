import type { APIRequestContext } from '@playwright/test'
import { E2E_WEBHOOK_SECRET } from '../common.helpers'

// The CodeBuild callbacks (src/app/api/services/*), played in-process. Each returns the raw response.

export type JobScanResultsBody = {
    jobId: string
    status: 'CODE-SUBMITTED' | 'CODE-SCANNED' | 'JOB-ERRORED'
    plaintextLog?: string
    round?: number
}

export type ContainerizerBody = {
    jobId: string
    status: 'JOB-PACKAGING' | 'JOB-READY' | 'JOB-ERRORED'
    plaintextLog?: string
    failureReason?: string
}

export type CodeEnvScanResultsBody = {
    codeEnvId: string
    status: 'SCAN-RUNNING' | 'SCAN-COMPLETE' | 'SCAN-FAILED'
    plaintextLog?: string
}

export function createWebhookClient(request: APIRequestContext, secret: string = E2E_WEBHOOK_SECRET) {
    const post = (route: string, data: unknown) =>
        request.post(route, { headers: { Authorization: `Bearer ${secret}` }, data })

    return {
        jobScanResults: (body: JobScanResultsBody) => post('/api/services/job-scan-results', body),
        containerizer: (body: ContainerizerBody) => post('/api/services/containerizer', body),
        codeEnvScanResults: (body: CodeEnvScanResultsBody) => post('/api/services/code-env-scan-results', body),
    }
}

export type WebhookClient = ReturnType<typeof createWebhookClient>
