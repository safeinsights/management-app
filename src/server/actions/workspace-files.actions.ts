'use server'

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { Action, z } from './action'
import { CODER_DISABLED, getConfigValue } from '@/server/config'
import { getInfoForStudyId } from '@/server/db/queries'
import { sanitizeFileName } from '@/lib/utils'
import { ensureBaselineJob } from '@/server/db/mutations'

async function getStudyFilesPath(studyId: string) {
    let coderFilesPath = await getConfigValue('CODER_FILES')
    if (!CODER_DISABLED) {
        coderFilesPath += `/${studyId}`
    }
    return coderFilesPath
}

export const uploadWorkspaceFileAction = new Action('uploadWorkspaceFileAction', { performsMutations: true })
    .params(z.object({ studyId: z.string(), file: z.instanceof(File) }))
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('load', 'IDE')
    .handler(async ({ db, params: { studyId, file } }) => {
        await ensureBaselineJob(db, studyId, { backdate: true })

        const coderFilesPath = await getStudyFilesPath(studyId)
        await fs.mkdir(coderFilesPath, { recursive: true })

        const fileName = sanitizeFileName(file.name)
        const filePath = path.join(coderFilesPath, fileName)
        const buffer = Buffer.from(await file.arrayBuffer())
        await fs.writeFile(filePath, buffer)

        return { fileName }
    })

export const deleteWorkspaceFileAction = new Action('deleteWorkspaceFileAction', { performsMutations: true })
    .params(z.object({ studyId: z.string(), fileName: z.string() }))
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('load', 'IDE')
    .handler(async ({ params: { studyId, fileName } }) => {
        const coderFilesPath = await getStudyFilesPath(studyId)
        const sanitized = sanitizeFileName(fileName)
        const filePath = path.join(coderFilesPath, sanitized)

        try {
            await fs.unlink(filePath)
        } catch (e) {
            if (e instanceof Error && 'code' in e && e.code === 'ENOENT') {
                // File already gone, that's fine
            } else {
                throw e
            }
        }

        return { success: true }
    })
