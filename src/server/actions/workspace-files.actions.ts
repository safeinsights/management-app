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
    .handler(async ({ db, params: { studyId, file }, session }) => {
        await ensureRoundJobForUpload(db, studyId)

        const coderFilesPath = await getStudyFilesPath(studyId)
        await fs.mkdir(coderFilesPath, { recursive: true })

        const fileName = sanitizeFileName(file.name)
        const filePath = path.join(coderFilesPath, fileName)
        const buffer = Buffer.from(await file.arrayBuffer())
        await fs.writeFile(filePath, buffer)

        // OTTER-693: feeds the Last activity column. Written after the file lands, so a failed
        // write cannot leave activity claiming an upload that never happened.
        await db
            .insertInto('workspaceFileActivity')
            .values({ studyId, fileName, userId: session.user.id, action: 'UPLOADED' })
            .execute()

        return { fileName }
    })

/**
 * OTTER-693: the card defines "Edited in IDE" as the pencil being clicked, not as a detected file
 * change — we cannot see inside the IDE. So this records intent, and is separate from
 * ensureWorkspaceAction because the pencil names a file while Launch IDE does not.
 */
export const recordWorkspaceFileEditAction = new Action('recordWorkspaceFileEditAction', {
    performsMutations: true,
})
    .params(z.object({ studyId: z.string(), fileName: z.string() }))
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('load', 'IDE')
    .handler(async ({ db, params: { studyId, fileName }, session }) => {
        await db
            .insertInto('workspaceFileActivity')
            .values({ studyId, fileName: sanitizeFileName(fileName), userId: session.user.id, action: 'EDITED_IN_IDE' })
            .execute()
    })

/**
 * OTTER-693: persists the star. Saved on click rather than at submit so the choice survives a
 * reload, and so the page's autosave indicator is telling the truth when it says everything is
 * saved. The name is not validated against the workspace here — a file can be deleted after being
 * chosen, and the page falls back when the saved name is no longer present.
 */
export const setMainCodeFileAction = new Action('setMainCodeFileAction', { performsMutations: true })
    .params(z.object({ studyId: z.string(), fileName: z.string() }))
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('load', 'IDE')
    .handler(async ({ db, params: { studyId, fileName } }) => {
        await db
            .updateTable('study')
            .set({ mainCodeFileName: sanitizeFileName(fileName) })
            .where('id', '=', studyId)
            .execute()
    })

export const getMainCodeFileAction = new Action('getMainCodeFileAction', {})
    .params(z.object({ studyId: z.string() }))
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('load', 'IDE')
    .handler(async ({ db, params: { studyId } }) => {
        const study = await db
            .selectFrom('study')
            .select('mainCodeFileName')
            .where('id', '=', studyId)
            .executeTakeFirst()

        return { mainCodeFileName: study?.mainCodeFileName ?? null }
    })

export const readWorkspaceFileAction = new Action('readWorkspaceFileAction', {})
    .params(z.object({ studyId: z.string(), fileName: z.string() }))
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('load', 'IDE')
    .handler(async ({ params: { studyId, fileName } }) => {
        const coderFilesPath = await getStudyFilesPath(studyId)
        const sanitized = sanitizeFileName(fileName)
        const filePath = path.join(coderFilesPath, sanitized)
        // Raw bytes, not utf-8: workspace files include binary artifacts like png plots (OTTER-516).
        const contents = await fs.readFile(filePath)
        return { fileName: sanitized, contents: new Uint8Array(contents).buffer }
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
                // already gone; deleting is idempotent
            } else {
                throw e
            }
        }

        return { success: true }
    })
