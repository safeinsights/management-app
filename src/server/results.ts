import { db } from '@/database'
import { MinimalJobInfo, MinimalJobResultsInfo } from '@/lib/types'
import { urlForResults } from './aws'
import { pathForStudyJob } from '@/lib/paths'
import { USING_S3_STORAGE, getUploadTmpDirectory } from './config'
import path from 'path'
import fs from 'fs'
import { storeStudyResultsFile } from './storage'

import { faker } from '@faker-js/faker'
import { siUser } from './queries'
import { StudyJobStatus } from '@/database/types'

export async function attachResultsToStudyJob(info: MinimalJobInfo, file: File, studyJobStatus: StudyJobStatus) {
    await storeStudyResultsFile(info, file)

    await db
        .updateTable('studyJob')
        .set({
            resultsPath: file.name,
        })
        .where('id', '=', info.studyJobId)
        .execute()

    const user = await siUser(false)

    await db
        .insertInto('jobStatusChange')
        .values({
            userId: user?.id,
            status: studyJobStatus,
            studyJobId: info.studyJobId,
        })
        .execute()
}

export async function attachSimulatedResultsToStudyJob(info: MinimalJobInfo) {
    const rows = Array.from({ length: faker.number.int({ min: 5, max: 25 }) }, () => [
        faker.person.fullName(),
        faker.internet.email(),
        faker.location.streetAddress(true),
        faker.location.city(),
        faker.location.country(),
        faker.phone.number(),
    ])
    // probably should use a real csv lib for this, but it's testing only so ¯\_(ツ)_/¯
    const csv = `Name,Email,Address,City,Country,Phone Number\n${rows.map((r) => r.join(',')).join('\n')}`
    const file = new File([csv], 'results.csv', { type: 'application/csv' })
    await attachResultsToStudyJob(info, file, 'RUN-COMPLETE')
}

export async function storageForResultsFile(info: MinimalJobResultsInfo) {
    if (USING_S3_STORAGE) {
        return { s3: true }
    } else {
        return { file: path.join(getUploadTmpDirectory(), pathForStudyJob(info), info.resultsPath) }
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
