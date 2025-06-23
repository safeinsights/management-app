import { fetchS3File, signedUrlForFile, storeS3File } from './aws'
import { CodeManifest, MinimalJobInfo, MinimalJobResultsInfo, MinimalStudyInfo, StudyDocumentType } from '@/lib/types'
import { pathForStudyDocumentFile, pathForStudyJobCodeFile, pathForStudyJobResults } from '@/lib/paths'

// TODO Move these into s3.ts later
async function fetchFile(filePath: string) {
    const stream = await fetchS3File(filePath)
    const chunks: Uint8Array[] = []
    for await (const chunk of stream) {
        chunks.push(chunk)
    }
    return new Blob(chunks)
}

export async function fetchStudyApprovedResultsFile(info: MinimalJobResultsInfo) {
    if (info.resultsType !== 'APPROVED') throw new Error('results type must be APPROVED')
    return await fetchFile(pathForStudyJobResults(info))
}

export async function fetchStudyEncryptedResultsFile(info: MinimalJobResultsInfo) {
    if (info.resultsType != 'ENCRYPTED') throw new Error('results type must be ENCRYPTED')
    return await fetchFile(pathForStudyJobResults(info))
}

async function urlForFile(filePath: string): Promise<string> {
    return await signedUrlForFile(filePath)
}

export async function urlForStudyJobCodeFile(info: MinimalJobInfo, fileName: string) {
    return urlForFile(pathForStudyJobCodeFile(info, fileName))
}

export async function urlForResultsFile(info: MinimalJobResultsInfo): Promise<string> {
    const filePath = pathForStudyJobResults(info)
    return urlForFile(filePath)
}

export async function urlForStudyDocumentFile(info: MinimalStudyInfo, fileType: StudyDocumentType, fileName: string) {
    return urlForFile(pathForStudyDocumentFile(info, fileType, fileName))
}

export async function fetchStudyCodeFile(info: MinimalJobInfo, filePath: string) {
    return await fetchFile(pathForStudyJobCodeFile(info, filePath))
}

export async function fetchCodeManifest(info: MinimalJobInfo) {
    const body = await fetchStudyCodeFile(info, 'manifest.json')
    if (!body) {
        throw new Error('Failed to fetch the manifest file.')
    }
    return JSON.parse(await body.text()) as CodeManifest
}

async function storeFile(filePath: string, info: MinimalStudyInfo, file: File) {
    await storeS3File(info, file.stream(), filePath)
}

export async function storeStudyResultsFile(info: MinimalJobResultsInfo, file: File) {
    return await storeFile(pathForStudyJobResults(info), info, file)
}

export async function fetchStudyResultsFile(info: MinimalJobResultsInfo) {
    return await fetchFile(pathForStudyJobResults(info))
}
