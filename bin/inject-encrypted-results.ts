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

    const already = await db
        .selectFrom('jobStatusChange')
        .where('studyJobId', '=', jobId)
        .where('status', '=', 'RUN-COMPLETE')
        .executeTakeFirst()
    if (!already) {
        await db.insertInto('jobStatusChange').values({ status: 'RUN-COMPLETE', studyJobId: jobId }).execute()
    }

    console.info(`✓ injected encrypted results + logs for job ${jobId} (status RUN-COMPLETE)`)
    console.info(`  Now: review the study as the reviewer, decrypt with the reviewer PEM, approve.`)
    await db.destroy()
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
