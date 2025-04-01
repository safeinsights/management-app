import path from 'path'
import fs from 'fs'
import { Readable } from 'stream'
import { storeS3File, fetchS3File, signedUrlForFile } from './aws'
import { MinimalStudyInfo, MinimalJobInfo, MinimalJobResultsInfo, CodeManifest, StudyDocumentType } from '@/lib/types'
import { pathForStudyJobResults, pathForStudyDocuments, pathForStudyJobCodeFile } from '@/lib/paths'
import { USING_S3_STORAGE, getUploadTmpDirectory } from './config'
import logger from '@/lib/logger'

async function fetchFile(filePath: string) {
    let stream: Readable
    if (USING_S3_STORAGE) {
        stream = await fetchS3File(filePath)
    } else {
        stream = fs.createReadStream(path.join(getUploadTmpDirectory(), filePath))
        stream.on('error', (err: unknown) => {
            logger.error(`error reading file ${filePath}: ${err}`)
        })
    }
    const chunks: Uint8Array[] = []
    for await (const chunk of stream) {
        chunks.push(chunk)
    }
    return new Blob(chunks)
}

export async function fetchStudyApprovedResultsFile(info: MinimalJobResultsInfo) {
    if (info.resultsType != 'APPROVED') throw new Error('results type must be APPROVED')
    return await fetchFile(pathForStudyJobResults(info))
}

export async function fetchStudyEncryptedResultsFile(info: MinimalJobResultsInfo) {
    if (info.resultsType != 'ENCRYPTED') throw new Error('results type must be ENCRYPTED')
    return await fetchFile(pathForStudyJobResults(info))
}

export type UrlOrContent = { url?: string; content?: Blob }
async function urlOrContentForFile(filePath: string): Promise<UrlOrContent> {
    if (USING_S3_STORAGE) {
        return { url: await signedUrlForFile(filePath) }
    } else {
        return { content: await fetchFile(filePath) }
    }
}

export async function urlOrContentForStudyJobCodeFile(info: MinimalJobInfo, fileName: string) {
    return urlOrContentForFile(pathForStudyJobCodeFile(info, fileName))
}

export async function urlOrPathToResultsFile(info: MinimalJobResultsInfo): Promise<{ url?: string; content?: Blob }> {
    const filePath = pathForStudyJobResults(info)
    return urlOrContentForFile(filePath)
}

export async function urlOrContentForStudyDocumentFile(
    info: MinimalStudyInfo,
    fileType: StudyDocumentType,
    fileName: string,
) {
    return urlOrContentForFile(pathForStudyDocuments(info, fileType, fileName))
}

export async function fetchStudyCodeFile(info: MinimalJobInfo, filePath: string) {
    return await fetchFile(pathForStudyJobCodeFile(info, filePath))
}

export async function fetchCodeManifest(info: MinimalJobInfo) {
    const body = await fetchStudyCodeFile(info, 'manifest.json')
    return JSON.parse(await body.text()) as CodeManifest
}

async function storeFile(filePath: string, info: MinimalStudyInfo, file: File) {
    if (USING_S3_STORAGE) {
        await storeS3File(info, file.stream(), filePath)
    } else {
        const dirName = path.join(getUploadTmpDirectory(), path.dirname(filePath))
        fs.mkdirSync(dirName, { recursive: true })
        const buffer = await file.arrayBuffer()
        await fs.promises.writeFile(path.join(dirName, path.basename(filePath)), Buffer.from(buffer))
    }
}

export async function storeStudyCodeFile(info: MinimalJobInfo, file: File) {
    await storeFile(pathForStudyJobCodeFile(info, file.name), info, file)
}

export async function storeStudyResultsFile(info: MinimalJobResultsInfo, file: File) {
    return await storeFile(pathForStudyJobResults(info), info, file)
}

export async function storeStudyDocumentFile(info: MinimalStudyInfo, fileType: StudyDocumentType, file: File) {
    await storeFile(pathForStudyDocuments(info, fileType, file.name), info, file)
}
