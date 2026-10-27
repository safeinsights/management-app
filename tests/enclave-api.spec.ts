import path from 'path'
import { expect, readTestSupportFile, test, visitAsRole, withRole } from './e2e.helpers'
import { jobFileTypes, seedCodeApprovedJobReady } from './e2e.seed'
import { ENCLAVE_PRIVATE_KEY_FILE, createEnclaveClient } from './api/enclave-client'
import { createWebhookClient } from './api/webhook-client'
import { REVIEWER_DASHBOARD } from './flows/dashboard.flows'

// The contract the enclave's Setup App and Trusted Output App rely on, driven in-process with the
// test key the seeds give the openstax org. Statuses are append-only, so each run owns one job and
// walks it in order.

const RESULT_FILE = 'tests/assets/safe-results.csv'
const LOG_FILE = 'tests/assets/error-log.txt'

// openssl's digest line (`SHA2-256(stdin)= <hex>`), the same value the seeds store as the fingerprint.
async function testKeyFingerprint() {
    return (await readTestSupportFile('public_key.sig')).split('= ')[1].trim()
}

type ReadyJob = { jobId: string; studyId: string; status: string; title: string; containerLocation: string }

test('an enclave runs a job end to end over the API', { tag: '@api' }, async ({ browser, request, studyFeatures }) => {
    const studyTitle = studyFeatures.uniqueTitle('enclave-api')
    const { studyId, jobId } = await seedCodeApprovedJobReady(studyTitle)
    const enclave = createEnclaveClient(request)
    const webhooks = createWebhookClient(request)

    const latestStatus = async () => ((await (await enclave.jobStatus(jobId!)).json()) as { status: string }).status
    const readyJobs = async () => ((await (await enclave.readyStudies()).json()) as { jobs: ReadyJob[] }).jobs

    // The containerizer reports packaging, then readiness; only then is the job runnable.
    expect((await webhooks.containerizer({ jobId: jobId!, status: 'JOB-PACKAGING' })).status()).toBe(200)
    expect(await latestStatus()).toBe('JOB-PACKAGING')
    expect((await webhooks.containerizer({ jobId: jobId!, status: 'JOB-READY' })).status()).toBe(200)

    expect((await readyJobs()).find((job) => job.jobId === jobId)).toMatchObject({
        studyId,
        status: 'JOB-READY',
        title: studyTitle,
        containerLocation: `test-container:${jobId}`,
    })

    // Every key of the Data Partner's members, to encrypt the outputs for; the seeds share one key.
    const fingerprint = await testKeyFingerprint()
    const { keys } = (await (await enclave.jobKeys(jobId!)).json()) as {
        keys: { jobId: string; fingerprint: string }[]
    }
    expect(keys.length).toBeGreaterThan(0)
    for (const key of keys) expect(key).toMatchObject({ jobId, fingerprint })

    for (const stage of ['JOB-PROVISIONING', 'JOB-RUNNING'] as const) {
        const response = await enclave.setJobStatus(jobId!, stage)
        expect(response.status(), await response.text()).toBe(200)
        expect(await latestStatus()).toBe(stage)
    }
    // A running job is still listed, so a restarted enclave can pick it up again.
    expect((await readyJobs()).find((job) => job.jobId === jobId)?.status).toBe('JOB-RUNNING')

    const upload = await enclave.uploadResults(jobId!, { resultFile: RESULT_FILE })
    expect(upload.status(), await upload.text()).toBe(200)
    expect(JSON.parse(await upload.text())).toEqual({ status: 'success' })
    expect(await latestStatus()).toBe('RUN-COMPLETE')
    expect(await jobFileTypes(jobId!)).toContain('ENCRYPTED-RESULT')
    expect((await readyJobs()).map((job) => job.jobId)).not.toContain(jobId)

    // Complete is final: neither another status nor another result gets in.
    const lateStatus = await enclave.setJobStatus(jobId!, 'JOB-RUNNING')
    expect(lateStatus.status()).toBe(422)
    expect(await lateStatus.text()).toBe('job is already complete')
    expect((await enclave.uploadResults(jobId!, { resultFile: RESULT_FILE })).status()).toBe(422)

    await withRole(browser, 'reviewer', async (page) => {
        await visitAsRole(page, REVIEWER_DASHBOARD)
        await expect(
            page.getByRole('row').filter({ hasText: studyTitle }).getByText('Outputs need review'),
        ).toBeVisible()
    })
})

test('an errored run reports its log once', { tag: '@api' }, async ({ request, studyFeatures }) => {
    const { jobId } = await seedCodeApprovedJobReady(studyFeatures.uniqueTitle('enclave-errored'))
    const enclave = createEnclaveClient(request)

    for (const stage of ['JOB-PROVISIONING', 'JOB-RUNNING', 'JOB-ERRORED'] as const) {
        const response = await enclave.setJobStatus(jobId!, stage)
        expect(response.status(), await response.text()).toBe(200)
    }

    // A log on its own means the run failed; the upload is accepted once and acknowledged after.
    const upload = await enclave.uploadResults(jobId!, { logFile: LOG_FILE })
    expect(upload.status(), await upload.text()).toBe(200)
    expect(JSON.parse(await upload.text())).toEqual({ status: 'success' })
    expect(((await (await enclave.jobStatus(jobId!)).json()) as { status: string }).status).toBe('JOB-ERRORED')
    expect(await jobFileTypes(jobId!)).toContain('ENCRYPTED-CODE-RUN-LOG')

    const again = await enclave.uploadResults(jobId!, { logFile: LOG_FILE })
    expect(again.status()).toBe(200)
    expect(JSON.parse(await again.text())).toEqual({ status: 'success', detail: 'artifacts already received' })
})

test('the job API refuses a token the org did not sign', { tag: '@api' }, async ({ request }) => {
    const forged = createEnclaveClient(request, {
        privateKeyFile: path.join(path.dirname(ENCLAVE_PRIVATE_KEY_FILE), 'invalid_private_key.pem'),
    })
    const forgedResponse = await forged.readyStudies()
    expect(forgedResponse.status()).toBe(401)
    expect(JSON.parse(await forgedResponse.text())).toEqual({
        error: 'Token error: JsonWebTokenError: invalid signature',
    })

    // A lab never runs code, so its slug is refused before the signature is even checked.
    const lab = createEnclaveClient(request, { orgSlug: 'openstax-lab' })
    const labResponse = await lab.readyStudies()
    expect(labResponse.status()).toBe(401)
    expect((JSON.parse(await labResponse.text()) as { error: string }).error).toContain('is not an enclave org')

    expect((await request.get('/api/studies/ready')).status()).toBe(401)
})
