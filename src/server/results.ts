import { db } from '@/database'
import { MinimalRunInfo, MinimalRunResultsInfo } from '@/lib/types'
import { storeResultsFile, urlForResults } from './aws'
import { pathForStudyRun } from '@/lib/paths'
import { USING_S3_STORAGE, getUploadTmpDirectory } from './config'
import path from 'path'
import fs from 'fs'
import { sanitizeFileName } from '@/lib/util'
import { faker } from '@faker-js/faker'

export async function attachResultsToStudyRun(info: MinimalRunInfo, file: File) {
    const fileName = sanitizeFileName(file.name)
    if (USING_S3_STORAGE) {
        await storeResultsFile({ ...info, resultsPath: fileName }, file.stream())
    } else {
        const dir = path.join(getUploadTmpDirectory(), pathForStudyRun(info), 'results', path.dirname(fileName))
        fs.mkdirSync(dir, { recursive: true })
        const filePath = path.join(dir, path.basename(fileName))
        const buffer = await file.arrayBuffer()
        await fs.promises.writeFile(filePath, Buffer.from(buffer))
    }

    await db
        .updateTable('studyRun')
        .set({
            status: 'COMPLETED',
            resultsPath: file.name,
            completedAt: new Date(),
        })
        .where('id', '=', info.studyRunId)
        .execute()
}

export async function attachSimulatedResultsToStudyRun(info: MinimalRunInfo) {
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
    await attachResultsToStudyRun(info, file)
}

export async function urlOrPathToResultsFile(info: MinimalRunResultsInfo) {
    if (USING_S3_STORAGE) {
        return { url: await urlForResults(info) }
    } else {
        const filePath = path.join(getUploadTmpDirectory(), pathForStudyRun(info), 'results', info.resultsPath)
        return {
            content: await fs.promises.readFile(filePath, 'utf-8'),
        }
    }
}
