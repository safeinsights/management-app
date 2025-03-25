import { sanitizeFileName } from '@/lib/util'
import path from 'path'
import fs from 'fs'
import { storeStudyFile } from './aws'
import { MinimalStudyInfo, MinimalJobInfo } from '@/lib/types'
import { pathForStudyJob, pathForStudyDocuments, pathForStudyJobCode } from '@/lib/paths'
import { USING_S3_STORAGE, getUploadTmpDirectory } from './config'

async function saveLocalFile(dir: string, file: File, fileName: string) {
    fs.mkdirSync(dir, { recursive: true })
    const filePath = path.join(dir, path.basename(fileName))
    const buffer = await file.arrayBuffer()

    await fs.promises.writeFile(filePath, Buffer.from(buffer))
}

// TODO Do we want to have an inverse method for retrieveFile centralized here?
async function storeFile(filePath: string, info: MinimalStudyInfo, file: File) {
    const fileName = sanitizeFileName(file.name)

    if (USING_S3_STORAGE) {
        await storeStudyFile(info, file.stream(), path.join(filePath, fileName))
    } else {
        const dir = path.join(getUploadTmpDirectory(), filePath)
        await saveLocalFile(dir, file, fileName)
    }
    return fileName
}

export async function storeStudyCodeFile(info: MinimalJobInfo, file: File) {
    return await storeFile(pathForStudyJobCode(info), info, file)
}

export async function storeStudyResultsFile(info: MinimalJobInfo, file: File) {
    return await storeFile(pathForStudyJob(info), info, file)
}

export async function storeStudyDocumentFile(info: MinimalStudyInfo, file: File) {
    return await storeFile(pathForStudyDocuments(info), info, file)
}
