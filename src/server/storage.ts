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

// export async function fetchStudyApprovedResultsFile(info: MinimalJobInfo) {
//     const file = await getStudyJobFileOfType(info.studyJobId, 'APPROVED_RESULT')
//     return await fetchFile(pathForStudyJobFile(info, file))
// }

// export async function fetchStudyEncryptedResultsFile(info: MinimalJobInfo) {
//     const file = await getStudyJobFileOfType(info.studyJobId, 'ENCRYPTED_RESULT')
//     return await fetchFile(pathForStudyJobFile(info, file))
// }

export async function urlForFile(filePath: string): Promise<string> {
    return await signedUrlForFile(filePath)
}

export async function urlForStudyJobCodeFile(info: MinimalJobInfo, fileName: string) {
    return urlForFile(pathForStudyJobCodeFile(info, fileName))
}

// export async function urlForResultsFile(info: MinimalJobResultsInfo): Promise<string> {
//     const filePath = pathForStudyJobResults(info)
//     return urlForFile(filePath)
// }

export async function urlForStudyDocumentFile(info: MinimalStudyInfo, fileType: StudyDocumentType, fileName: string) {
    return urlForFile(pathForStudyDocumentFile(info, fileType, fileName))
}

// export async function fetchStudyCodeFile(info: MinimalJobInfo, filePath: string) {
//     return await fetchFile(pathForStudyJobCodeFile(info, filePath))
// }

// export async function fetchCodeManifest(info: MinimalJobInfo) {
//     const body = await fetchStudyCodeFile(info, 'manifest.json')
//     return JSON.parse(await body.text()) as CodeManifest
// }

async function storeJobFile(info: MinimalJobInfo, path: string, file: File, fileType: FileType) {
    await storeS3File(info, file.stream(), path)

    return await db
        .insertInto('studyJobFile')
        .values({ path, name: file.name, studyJobId: info.studyJobId, fileType })
        .executeTakeFirstOrThrow()
}

export async function storeStudyEncryptedResultsFile(info: MinimalJobInfo, file: File) {
    return await storeJobFile(info, `${pathForStudyJob(info)}/results/encrypted-results.zip`, file, 'ENCRYPTED-RESULT')
}

export async function storeStudyApprovedResultsFile(info: MinimalJobInfo, file: File) {
    return await storeJobFile(info, `${pathForStudyJob(info)}/results/approved/${file.name}`, file, 'APPROVED-RESULT')
}

// export async function fetchStudyResultsFile(info: MinimalJobResultsInfo) {
//     return await fetchFile(pathForStudyJobResults(info))
// }
