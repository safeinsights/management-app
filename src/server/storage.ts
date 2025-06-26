import { fetchS3File, signedUrlForFile, storeS3File } from './aws'
import { MinimalJobInfo, MinimalStudyInfo, StudyDocumentType } from '@/lib/types'
import { pathForStudyJob, pathForStudyJobCodeFile, pathForStudyDocumentFile } from '@/lib/paths'

import { db } from '@/database'
import { FileType } from '@/database/types'

export async function fetchFileContents(filePath: string) {
    const stream = await fetchS3File(filePath)
    const chunks: Uint8Array[] = []
    for await (const chunk of stream) {
        chunks.push(chunk)
    }
    return new Blob(chunks)
}

export async function urlForFile(filePath: string): Promise<string> {
    return await signedUrlForFile(filePath)
}

export async function urlForStudyJobCodeFile(info: MinimalJobInfo, fileName: string) {
    return urlForFile(pathForStudyJobCodeFile(info, fileName))
}

export async function urlForStudyDocumentFile(info: MinimalStudyInfo, fileType: StudyDocumentType, fileName: string) {
    return urlForFile(pathForStudyDocumentFile(info, fileType, fileName))
}

async function storeJobFile(info: MinimalJobInfo, path: string, file: File, fileType: FileType, sourceId?: string) {
    await storeS3File(info, file.stream(), path)

    return await db
        .insertInto('studyJobFile')
        .values({ path, name: file.name, studyJobId: info.studyJobId, fileType, sourceId })
        .executeTakeFirstOrThrow()
}

export async function storeStudyEncryptedLogFile(info: MinimalJobInfo, file: File) {
    return await storeJobFile(info, `${pathForStudyJob(info)}/results/encrypted-logs.zip`, file, 'ENCRYPTED-LOG')
}

export async function storeStudyEncryptedResultsFile(info: MinimalJobInfo, file: File) {
    return await storeJobFile(info, `${pathForStudyJob(info)}/results/encrypted-results.zip`, file, 'ENCRYPTED-RESULT')
}

// export async function storeApprovedJobFile(info: MinimalJobInfo, file: File) {
//
// }

// TODO Just use generic function that takes the StudyJobFile and uses .fileType
// TODO Also, store the `sourceId` from the encrypted file so it can reference the original zip file
export async function storeStudyApprovedResultsFile(info: MinimalJobInfo, file: File) {
    return await storeJobFile(info, `${pathForStudyJob(info)}/results/approved/${file.name}`, file, 'APPROVED-RESULT')
}

export async function storeStudyApprovedLogFile(info: MinimalJobInfo, file: File) {
    return await storeJobFile(info, `${pathForStudyJob(info)}/results/approved/${file.name}`, file, 'APPROVED-LOG')
}
