'use server'

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { Action, z } from './action'
import { CODER_DISABLED, getConfigValue } from '@/server/config'
import { getInfoForStudyId } from '@/server/db/queries'
import { sanitizeFileName } from '@/lib/utils'
import { ensureRoundJobForUpload } from '@/server/db/mutations'

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
        await ensureRoundJobForUpload(db, studyId)

        const coderFilesPath = await getStudyFilesPath(studyId)
        await fs.mkdir(coderFilesPath, { recursive: true })

        const fileName = sanitizeFileName(file.name)
        const filePath = path.join(coderFilesPath, fileName)
        const buffer = Buffer.from(await file.arrayBuffer())
        await fs.writeFile(filePath, buffer)

        return { fileName }
    })

export const readWorkspaceFileAction = new Action('readWorkspaceFileAction', {})
    .params(z.object({ studyId: z.string(), fileName: z.string() }))
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('load', 'IDE')
    .handler(async ({ params: { studyId, fileName } }) => {
        const coderFilesPath = await getStudyFilesPath(studyId)
        const sanitized = sanitizeFileName(fileName)
        const filePath = path.join(coderFilesPath, sanitized)
        // Raw bytes, not utf-8: workspace files include binary artifacts like png plots (OTTER-516)
        const contents = await fs.readFile(filePath)
        return { fileName: sanitized, contents: new Uint8Array(contents).buffer }
    })

export const deleteWorkspaceFileAction = new Action('deleteWorkspaceFileAction', { performsMutations: true })
    .params(z.object({ studyId: z.string(), fileName: z.string() }))
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('load', 'IDE')
    .handler(async ({ db, params: { studyId, fileName } }) => {
        const coderFilesPath = await getStudyFilesPath(studyId)
        const sanitized = sanitizeFileName(fileName)
        const filePath = path.join(coderFilesPath, sanitized)

        // OTTER-636: locate the file first. Deleting a missing file is idempotent success and must NOT
        // open a draft round (it is not a real edit). Deleting a real file IS a real edit, so open/reuse
        // the current draft round, then unlink; if the unlink fails the surrounding transaction rolls
        // back the round insert.
        try {
            await fs.access(filePath)
        } catch (e) {
            if (e instanceof Error && 'code' in e && e.code === 'ENOENT') {
                return { success: true }
            }
            throw e
        }

        await ensureRoundJobForUpload(db, studyId)
        await fs.unlink(filePath)

        return { success: true }
    })
