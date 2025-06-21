import { fetchS3File, signedUrlForFile, storeS3File } from './aws'
import { CodeManifest, MinimalJobInfo, MinimalJobResultsInfo, MinimalStudyInfo, StudyDocumentType } from '@/lib/types'
import { pathForStudyDocumentFile, pathForStudyJobCodeFile, pathForStudyJobResults } from '@/lib/paths'
import logger from '@/lib/logger'

// TODO Move these into s3.ts later
async function fetchFile(filePath: string) {
    try {
        const stream = await fetchS3File(filePath)
        const chunks: Uint8Array[] = []
        for await (const chunk of stream) {
            chunks.push(chunk)
        }
        return new Blob(chunks)
    } catch (e) {
        logger.error('Failed to fetch file', e)
    }
}

export async function fetchStudyApprovedResultsFile(info: MinimalJobResultsInfo) {
    try {
        if (info.resultsType != 'APPROVED') throw new Error('results type must be APPROVED')
        return await fetchFile(pathForStudyJobResults(info))
    } catch (e) {
        logger.error('Failed to fetch study approved results file', e)
    }
}

export async function fetchStudyEncryptedResultsFile(info: MinimalJobResultsInfo) {
    try {
        if (info.resultsType != 'ENCRYPTED') throw new Error('results type must be ENCRYPTED')
        return await fetchFile(pathForStudyJobResults(info))
    } catch (e) {
        logger.error('Failed to fetch study encrypted results file', e)
    }
}

async function urlForFile(filePath: string): Promise<string> {
    try {
        return await signedUrlForFile(filePath)
    } catch (e) {
        logger.error('Failed to get url for results file', e)
        throw e
    }
}

export async function urlForStudyJobCodeFile(info: MinimalJobInfo, fileName: string) {
    try {
        return urlForFile(pathForStudyJobCodeFile(info, fileName))
    } catch (e) {
        logger.error(e)
    }
}

export async function urlForResultsFile(info: MinimalJobResultsInfo): Promise<string> {
    try {
        const filePath = pathForStudyJobResults(info)
        return urlForFile(filePath)
    } catch (e) {
        logger.error(e)
        throw e
    }
}

export async function urlForStudyDocumentFile(info: MinimalStudyInfo, fileType: StudyDocumentType, fileName: string) {
    try {
        return urlForFile(pathForStudyDocumentFile(info, fileType, fileName))
    } catch (e) {
        logger.error('Failed to fetch study code file', e)
    }
}

export async function fetchStudyCodeFile(info: MinimalJobInfo, filePath: string) {
    try {
        return await fetchFile(pathForStudyJobCodeFile(info, filePath))
    } catch (e) {
        logger.error(e)
    }
}

export async function fetchCodeManifest(info: MinimalJobInfo) {
    try {
        const body = await fetchStudyCodeFile(info, 'manifest.json')
        if (!body) {
            throw new Error('Failed to fetch the manifest file.')
        }
        return JSON.parse(await body.text()) as CodeManifest
    } catch (e) {
        logger.error('Failed to store study results file', e)
    }
}

async function storeFile(filePath: string, info: MinimalStudyInfo, file: File) {
    try {
        await storeS3File(info, file.stream(), filePath)
    } catch (e) {
        logger.error(e)
    }
}

export async function storeStudyResultsFile(info: MinimalJobResultsInfo, file: File) {
    try {
        return await storeFile(pathForStudyJobResults(info), info, file)
    } catch (e) {
        logger.error(e)
    }
}

export async function fetchStudyResultsFile(info: MinimalJobResultsInfo) {
    try {
        return await fetchFile(pathForStudyJobResults(info))
    } catch (e) {
        logger.error('Failed to fetch study results file', e)
    }
}
