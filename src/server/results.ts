import { db } from '@/database'
import { MinimalJobInfo, MinimalJobResultsInfo } from '@/lib/types'
import { urlForResults } from './aws'
import { pathForStudyJobResults } from '@/lib/paths'
import { getUploadTmpDirectory, USING_S3_STORAGE } from './config'
import path from 'path'
import fs from 'fs'
import { storeStudyResultsFile } from './storage'
import { siUser } from './db/queries'

export async function attachApprovedResultsToStudyJob(info: MinimalJobInfo, file: File) {
    await storeStudyResultsFile({ ...info, resultsType: 'APPROVED', resultsPath: file.name }, file)

    const user = await siUser(false)

    await db.updateTable('studyJob').set({ resultsPath: file.name }).where('id', '=', info.studyJobId).execute()

    await db
        .insertInto('jobStatusChange')
        .values({
            userId: user?.id,
            status: 'RESULTS-APPROVED',
            studyJobId: info.studyJobId,
        })
        .execute()
}

export async function storageForResultsFile(info: MinimalJobResultsInfo) {
    if (USING_S3_STORAGE) {
        return { s3: true }
    } else {
        return { file: path.join(getUploadTmpDirectory(), pathForStudyJobResults(info)) }
    }
}

export async function urlOrPathToResultsFile(info: MinimalJobResultsInfo) {
    const storage = await storageForResultsFile(info)
    if (storage.s3) {
        return { url: await urlForResults(info) }
    }
    if (storage.file) {
        return { content: await fs.promises.readFile(storage.file, 'utf-8') }
    }
    throw new Error(`unknown storage type for results file ${JSON.stringify(storage)}`)
}
