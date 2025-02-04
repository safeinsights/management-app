import path from 'path'
import fs from 'fs'
import { getUploadTmpDirectory, PROD_ENV } from '@/server/config'
import { pathForStudyRunCode } from '@/lib/paths'
import { MinimalRunInfo } from '@/lib/types'

type PseudoFile = { name: string }

const dirForFile = (info: MinimalRunInfo, file: PseudoFile) =>
    path.join(getUploadTmpDirectory(), pathForStudyRunCode(info), path.dirname(file.name))

export async function devStoreCodeFile(
    info: MinimalRunInfo,
    file: PseudoFile & { arrayBuffer: () => Promise<ArrayBuffer> },
) {
    if (PROD_ENV) throw new Error('This method is only available in development')

    const dir = dirForFile(info, file)
    fs.mkdirSync(dir, { recursive: true })
    const filePath = path.join(dir, path.basename(file.name))
    const buffer = await file.arrayBuffer()
    await fs.promises.writeFile(filePath, Buffer.from(buffer))
}

export async function devReadCodeFile(info: MinimalRunInfo, fileName: string) {
    if (PROD_ENV) throw new Error('This method is only available in development')

    const dir = dirForFile(info, { name: fileName })
    return await fs.promises.readFile(path.join(dir, path.basename(fileName)))
}
