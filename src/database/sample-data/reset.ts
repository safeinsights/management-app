import type { Transaction } from 'kysely'
import type { DB } from '@/database/types'

// The delete order of deleteStudyRows in src/server/qa-cleanup.ts. That module pulls in Clerk and
// next/headers, which the migrator bundle cannot load, so the order is repeated here. Comments,
// reviews, opened rows and file keys go with their study or file by cascade.
export async function deleteSampleStudy(trx: Transaction<DB>, studyId: string) {
    const jobs = await trx.selectFrom('studyJob').select('id').where('studyId', '=', studyId).execute()
    if (jobs.length) {
        const jobIds = jobs.map((job) => job.id)
        // eslint-disable-next-line custom/noJobStatusWrites -- the jobs themselves are deleted below
        await trx.deleteFrom('jobStatusChange').where('studyJobId', 'in', jobIds).execute()
        await trx.deleteFrom('studyJobFile').where('studyJobId', 'in', jobIds).execute()
        // eslint-disable-next-line custom/noJobStatusWrites -- every job of the study goes, with the study
        await trx.deleteFrom('studyJob').where('id', 'in', jobIds).execute()
    }
    await trx.deleteFrom('yjsDocument').where('studyId', '=', studyId).execute()

    const documents = await trx.selectFrom('legalDocument').select('id').where('studyId', '=', studyId).execute()
    if (documents.length) {
        const documentIds = documents.map((document) => document.id)
        const versions = await trx
            .selectFrom('legalDocumentVersion')
            .select('id')
            .where('legalDocumentId', 'in', documentIds)
            .execute()
        if (versions.length) {
            const versionIds = versions.map((version) => version.id)
            await trx
                .deleteFrom('legalDocumentAcknowledgement')
                .where('legalDocumentVersionId', 'in', versionIds)
                .execute()
            await trx.deleteFrom('legalDocumentVersion').where('id', 'in', versionIds).execute()
        }
        await trx.deleteFrom('legalDocument').where('id', 'in', documentIds).execute()
    }

    await trx.deleteFrom('study').where('id', '=', studyId).execute()
}
