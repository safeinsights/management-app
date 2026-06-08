/* eslint-disable no-console */
/**
 * DEV-ONLY: inject encrypted results into a job, mimicking what the Trusted Output App
 * POSTs to /api/job/[jobId]/results — without the org-API auth dance. Lets you exercise
 * the reviewer-decrypt → approve(re-wrap) → researcher-decrypt flow locally.
 *
 * Prereq: the job's reviewer(s) (enclave org users) must already have a key — generate it
 * in the UI at /account/keys first, so getOrgPublicKeys returns a recipient to encrypt for.
 *
 * Run inside the container:
 *   docker exec mgmnt-app pnpm exec tsx bin/inject-encrypted-results.ts <jobId>
 */
import { db } from '@/database'
import { storeStudyEncryptedLogFile, storeStudyEncryptedResultsFile } from '@/server/storage'
import { ResultsWriter } from 'si-encryption/job-results/writer'

// Inline (not @/server/db/queries) — that module pulls in the Action framework → Clerk,
// which tsx can't import standalone. Mirrors getOrgPublicKeys.
async function orgPublicKeys(orgId: string): Promise<{ publicKey: ArrayBuffer; fingerprint: string }[]> {
    const rows = await db
        .selectFrom('orgUser')
        .innerJoin('userPublicKey', 'userPublicKey.userId', 'orgUser.userId')
        .select(['userPublicKey.publicKey', 'userPublicKey.fingerprint'])
        .where('orgUser.orgId', '=', orgId)
        .execute()
    return rows.map(({ publicKey, fingerprint }) => {
        const ab = new ArrayBuffer(publicKey.byteLength)
        new Uint8Array(ab).set(publicKey)
        return { publicKey: ab, fingerprint }
    })
}

const toArrayBuffer = (s: string): ArrayBuffer => {
    const buf = Buffer.from(s, 'utf-8')
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

async function buildZip(
    files: Array<{ name: string; content: string }>,
    keys: { publicKey: ArrayBuffer; fingerprint: string }[],
): Promise<File> {
    const writer = new ResultsWriter(keys)
    for (const f of files) await writer.addFile(f.name, toArrayBuffer(f.content))
    const zip = await writer.generate()
    return new File([zip], 'encrypted.zip', { type: 'application/zip' })
}

async function main() {
    const jobId = process.argv[2]
    if (!jobId) throw new Error('usage: tsx bin/inject-encrypted-results.ts <jobId>')

    const info = await db
        .selectFrom('studyJob')
        .innerJoin('study', 'study.id', 'studyJob.studyId')
        .innerJoin('org', 'org.id', 'study.orgId')
        .select(['studyJob.id as studyJobId', 'study.id as studyId', 'study.orgId as orgId', 'org.slug as orgSlug'])
        .where('studyJob.id', '=', jobId)
        .executeTakeFirstOrThrow(() => new Error(`job ${jobId} not found`))

    // Encrypt for the enclave org's reviewer keys — exactly what TOA does. The reviewer
    // decrypts with their private key, then re-wraps for researchers at approve.
    const reviewerKeys = await orgPublicKeys(info.orgId)
    if (!reviewerKeys.length) {
        throw new Error(
            `org ${info.orgSlug} has no public keys — log in as the reviewer and generate one at /account/keys first`,
        )
    }
    console.info(`Encrypting for ${reviewerKeys.length} reviewer key(s) in org ${info.orgSlug}`)

    // Idempotent: don't stack duplicate result rows if re-run against the same job.
    const alreadyHasResults = await db
        .selectFrom('studyJobFile')
        .select('id')
        .where('studyJobId', '=', jobId)
        .where('fileType', '=', 'ENCRYPTED-RESULT')
        .executeTakeFirst()

    if (alreadyHasResults) {
        console.info(`Job already has encrypted results — skipping store (delete study_job_file rows to re-inject).`)
    } else {
        const resultsZip = await buildZip(
            [
                { name: 'results.csv', content: 'group,count\nA,42\nB,17\n' },
                { name: 'summary.txt', content: 'analysis complete: 2 groups\n' },
            ],
            reviewerKeys,
        )
        const logZip = await buildZip([{ name: 'run.log', content: 'job started\njob finished ok\n' }], reviewerKeys)
        await storeStudyEncryptedResultsFile(info, resultsZip)
        await storeStudyEncryptedLogFile(info, logZip, 'ENCRYPTED-CODE-RUN-LOG')
    }

    // Make the status chain realistic. A results-stage job must have had its code
    // approved first — otherwise the proposal-level review buttons stay visible (they
    // only hide once the study is APPROVED *and* the code was reviewed). Inject
    // CODE-APPROVED before RUN-COMPLETE so the latest status stays RUN-COMPLETE and the
    // page shows only the results Approve/Reject.
    const statuses = await db
        .selectFrom('jobStatusChange')
        .select(['status', 'createdAt'])
        .where('studyJobId', '=', jobId)
        .execute()
    const has = (s: string) => statuses.some((r) => r.status === s)
    const runComplete = statuses.find((r) => r.status === 'RUN-COMPLETE')

    if (!has('CODE-APPROVED')) {
        // 1s before an existing RUN-COMPLETE, or 2s in the past on a fresh job so it
        // reliably precedes the RUN-COMPLETE inserted just below.
        const ts = runComplete
            ? new Date(new Date(runComplete.createdAt).getTime() - 1000)
            : new Date(Date.now() - 2000)
        await db
            .insertInto('jobStatusChange')
            .values({ status: 'CODE-APPROVED', studyJobId: jobId, createdAt: ts })
            .execute()
    }
    if (!runComplete) {
        await db.insertInto('jobStatusChange').values({ status: 'RUN-COMPLETE', studyJobId: jobId }).execute()
    }
    // Code approved ⇒ proposal-level review is done; study is back to APPROVED.
    await db.updateTable('study').set({ status: 'APPROVED' }).where('id', '=', info.studyId).execute()

    console.info(`✓ injected encrypted results + logs for job ${jobId} (CODE-APPROVED → RUN-COMPLETE, study APPROVED)`)
    console.info(`  Now: review as the reviewer, decrypt with the reviewer PEM, Approve in the Study Status card.`)
    await db.destroy()
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
