import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs'
import { mockClient } from 'aws-sdk-client-mock'
import { onTestFinished, vi } from 'vitest'

// Kept out of unit.helpers so the AWS mock only loads for suites that queue jobs.

// Sends background jobs to a stubbed queue for the rest of the test, so a code submission or retry asks
// for its summary instead of running the model in-process. Returns the stub to read or answer the sends.
export const stubJobQueue = () => {
    const sqs = mockClient(SQSClient)
    sqs.on(SendMessageCommand).resolves({})
    vi.stubEnv('JOB_QUEUE_URL', 'https://sqs.test/jobs')
    onTestFinished(() => {
        sqs.restore()
        vi.unstubAllEnvs()
    })
    return sqs
}
