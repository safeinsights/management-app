import { sql, type Kysely, type Transaction } from 'kysely'
import type { DB } from '@/database/types'
import {
    buildLastOpened,
    buildStudyRows,
    type BuildContext,
    type EncryptedArtifact,
    type StudyRows,
} from './build-rows'
import { encryptFiles, orgRecipients, type Recipient } from './encrypt'
import { personIds, seedExtras } from './extras'
import { studyId } from './ids'
import { resolveRefs } from './refs'
import type { Upload, Uploader } from './s3'
import type { StudySpec } from './spec'
import { SAMPLE_STUDIES } from './studies'

export type SeedOptions = { uploader: Uploader | null; now?: Date; specs?: StudySpec[]; log?: (line: string) => void }
export type SeedSummary = { written: number; skipped: number; failed: number; missing: string[] }

type Recipients = { enclave: Recipient[]; lab: Recipient[] }

type EncryptedRows = {
    uploads: Upload[]
    files: StudyRows['files']
    recipientKeys: { studyJobFileId: string; filePath: string; fingerprint: string; crypt: string }[]
    fileActivity: {
        studyJobFileId: string
        filePath: string
        userId: string
        orgId: string
        action: 'VIEWED' | 'DOWNLOADED'
        createdAt: Date
    }[]
}

async function encryptArtifacts(
    artifacts: EncryptedArtifact[],
    recipients: Recipients,
    ctx: BuildContext,
    log: (line: string) => void,
): Promise<EncryptedRows> {
    const out: EncryptedRows = { uploads: [], files: [], recipientKeys: [], fileActivity: [] }
    for (const artifact of artifacts) {
        const wrapFor = artifact.sharedWithLab ? [...recipients.enclave, ...recipients.lab] : recipients.enclave
        const unique = [...new Map(wrapFor.map((r) => [r.fingerprint, r])).values()]
        const archive = await encryptFiles(artifact.files, unique, artifact.jobId)
        if (!archive) {
            log(`sample-data: no enclave public keys, so ${artifact.name} is left out`)
            continue
        }
        out.uploads.push({ path: artifact.path, body: archive.zip, contentType: 'application/zip' })
        out.files.push({
            id: artifact.fileId,
            studyJobId: artifact.jobId,
            name: artifact.name,
            path: artifact.path,
            fileType: artifact.fileType,
            createdAt: artifact.createdAt,
        })

        if (artifact.sharedWithLab) {
            for (const [filePath, byFingerprint] of Object.entries(archive.keys)) {
                for (const { fingerprint } of recipients.lab) {
                    out.recipientKeys.push({
                        studyJobFileId: artifact.fileId,
                        filePath,
                        fingerprint,
                        crypt: byFingerprint[fingerprint],
                    })
                }
            }
        }
        if (artifact.labActivityAt) {
            for (const action of ['VIEWED', 'DOWNLOADED'] as const) {
                out.fileActivity.push({
                    studyJobFileId: artifact.fileId,
                    filePath: 'results.csv',
                    userId: ctx.refs.researcherId,
                    orgId: ctx.refs.lab.id,
                    action,
                    createdAt: artifact.labActivityAt,
                })
            }
        }
    }
    return out
}

async function insertStudy(trx: Transaction<DB>, rows: StudyRows, encrypted: EncryptedRows) {
    await trx.insertInto('study').values(rows.study).execute()
    if (rows.agreement) {
        await trx.insertInto('legalDocument').values(rows.agreement.document).execute()
        await trx.insertInto('legalDocumentVersion').values(rows.agreement.version).execute()
        if (rows.agreement.acknowledgements.length) {
            await trx
                .insertInto('legalDocumentAcknowledgement')
                .values(rows.agreement.acknowledgements)
                .onConflict((oc) => oc.constraint('legal_document_acknowledgement_unique').doNothing())
                .execute()
        }
    }
    if (rows.jobs.length) await trx.insertInto('studyJob').values(rows.jobs).execute()
    if (rows.reviews.length) {
        await trx
            .insertInto('studyReview')
            .values(rows.reviews.map((r) => ({ ...r, report: sql`${JSON.stringify(r.report)}::jsonb` })))
            .execute()
    }
    if (rows.statusChanges.length) await trx.insertInto('jobStatusChange').values(rows.statusChanges).execute()
    const files = [...rows.files, ...encrypted.files]
    if (files.length) await trx.insertInto('studyJobFile').values(files).execute()
    if (encrypted.recipientKeys.length)
        await trx.insertInto('studyJobFileRecipientKey').values(encrypted.recipientKeys).execute()
    if (encrypted.fileActivity.length)
        await trx.insertInto('studyJobFileActivity').values(encrypted.fileActivity).execute()
    if (rows.proposalComments.length)
        await trx.insertInto('studyProposalComment').values(rows.proposalComments).execute()
    if (rows.reviewComments.length) await trx.insertInto('studyReviewComment').values(rows.reviewComments).execute()
    if (rows.workspaceActivity.length)
        await trx.insertInto('workspaceFileActivity').values(rows.workspaceActivity).execute()
    await insertLastOpened(trx, rows.lastOpened)
}

async function insertLastOpened(db: Kysely<DB>, rows: StudyRows['lastOpened']) {
    if (!rows.length) return
    await db
        .insertInto('studyLastOpened')
        .values(rows)
        .onConflict((oc) => oc.constraint('study_last_opened_user_study_unique').doNothing())
        .execute()
}

async function partyUserIds(db: Kysely<DB>, orgIds: string[]) {
    const rows = await db.selectFrom('orgUser').select('userId').distinct().where('orgId', 'in', orgIds).execute()
    return rows.map((row) => row.userId)
}

export async function seedSampleData(db: Kysely<DB>, options: SeedOptions): Promise<SeedSummary> {
    const log = options.log ?? console.log // eslint-disable-line no-console
    const summary: SeedSummary = { written: 0, skipped: 0, failed: 0, missing: [] }

    const resolved = await resolveRefs(db)
    if ('missing' in resolved) {
        log(`sample-data: skipped, fixed test ids not found: ${resolved.missing.join(', ')}`)
        return { ...summary, missing: resolved.missing }
    }
    const { refs } = resolved

    await seedExtras(db, refs)

    const ctx: BuildContext = {
        now: options.now ?? new Date(),
        refs,
        people: personIds(refs),
        members: {
            researcher: await partyUserIds(db, [refs.lab.id]),
            reviewer: await partyUserIds(db, [refs.enclave.id]),
        },
    }
    const recipients: Recipients = {
        enclave: await orgRecipients(db, [refs.enclave.id]),
        lab: await orgRecipients(db, [refs.lab.id]),
    }

    for (const spec of options.specs ?? SAMPLE_STUDIES) {
        const exists = await db.selectFrom('study').select('id').where('id', '=', studyId(spec.n)).executeTakeFirst()
        if (exists) {
            // Org members can change after the study was written, so add missing opened rows. Existing rows stay.
            try {
                await insertLastOpened(db, buildLastOpened(spec, ctx))
            } catch (error) {
                log(`sample-data: #${spec.n} opened rows not written: ${String(error)}`)
            }
            summary.skipped++
            continue
        }
        try {
            const rows = buildStudyRows(spec, ctx)
            const encrypted = await encryptArtifacts(rows.encrypted, recipients, ctx, log)
            if (options.uploader) {
                for (const upload of [...rows.uploads, ...encrypted.uploads]) await options.uploader.put(upload)
            }
            // eslint-disable-next-line no-restricted-syntax -- runs in the migrator, outside any request context
            await db.transaction().execute((trx) => insertStudy(trx, rows, encrypted))
            summary.written++
        } catch (error) {
            summary.failed++
            log(`sample-data: #${spec.n} "${spec.title}" not written: ${String(error)}`)
        }
    }

    log(`sample-data: ${summary.written} written, ${summary.skipped} already there, ${summary.failed} failed`)
    return summary
}
