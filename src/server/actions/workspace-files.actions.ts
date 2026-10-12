'use server'

import type { DBExecutor } from '@/database'
import { Action, z } from './action'
import { studyFileStore } from '@/server/workspace-files'
import { getInfoForStudyId } from '@/server/db/queries'
import { sanitizeFileName } from '@/lib/utils'
import { ensureRoundJobForUpload } from '@/server/db/mutations'
import { requireChangeableCodeFiles } from '@/server/study-code-gate'
import {
    ACCEPTED_FILE_FORMATS_TEXT,
    hasAcceptedExtension,
    MAX_UPLOAD_FILE_BYTES,
    MAX_UPLOAD_FILE_TEXT,
} from '@/lib/types'

// OTTER-617: the researcher's Last updated reads this; the data partner's does not.
const stampLabEdit = (db: DBExecutor, studyId: string) =>
    db.updateTable('study').set({ labEditedAt: new Date() }).where('id', '=', studyId).execute()

export const uploadWorkspaceFileAction = new Action('uploadWorkspaceFileAction', { performsMutations: true })
    // Both are card rules, so they belong where every caller passes rather than only in the
    // dropzone — the action otherwise accepts anything under next.config's 6 MB body cap.
    .params(
        z.object({
            studyId: z.string(),
            file: z
                .instanceof(File)
                .refine((f) => f.size <= MAX_UPLOAD_FILE_BYTES, MAX_UPLOAD_FILE_TEXT)
                .refine((f) => hasAcceptedExtension(f.name), ACCEPTED_FILE_FORMATS_TEXT),
        }),
    )
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('load', 'IDE')
    .middleware(requireChangeableCodeFiles(({ params }) => params.studyId))
    .handler(async ({ db, params: { studyId, file }, session }) => {
        await ensureRoundJobForUpload(db, studyId)

        const fileName = sanitizeFileName(file.name)
        await (await studyFileStore()).write(studyId, fileName, Buffer.from(await file.arrayBuffer()))

        // OTTER-693: feeds the Last activity column. Written after the file lands, so a failed
        // write cannot leave activity claiming an upload that never happened.
        await db
            .insertInto('workspaceFileActivity')
            .values({ studyId, fileName, userId: session.user.id, action: 'UPLOADED' })
            .execute()
        await stampLabEdit(db, studyId)

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
    .middleware(requireChangeableCodeFiles(({ params }) => params.studyId))
    .handler(async ({ db, params: { studyId, fileName }, session }) => {
        await db
            .insertInto('workspaceFileActivity')
            .values({ studyId, fileName: sanitizeFileName(fileName), userId: session.user.id, action: 'EDITED_IN_IDE' })
            .execute()
    })

/**
 * OTTER-693: persists the star on click rather than at submit, so the choice survives a reload.
 * The name is not validated against the workspace — a file can be deleted after being chosen, and
 * the page falls back when the saved name is no longer present.
 */
export const setMainCodeFileAction = new Action('setMainCodeFileAction', { performsMutations: true })
    .params(z.object({ studyId: z.string(), fileName: z.string() }))
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('load', 'IDE')
    .middleware(requireChangeableCodeFiles(({ params }) => params.studyId))
    .handler(async ({ db, params: { studyId, fileName } }) => {
        await db
            .updateTable('study')
            .set({ mainCodeFileName: sanitizeFileName(fileName), labEditedAt: new Date() })
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
        const sanitized = sanitizeFileName(fileName)
        // Raw bytes, not utf-8: workspace files include binary artifacts like png plots (OTTER-516).
        const contents = await (await studyFileStore()).read(studyId, sanitized)
        if (!contents) throw new Error(`File not found: ${sanitized}`)
        return { fileName: sanitized, contents: new Uint8Array(contents).buffer }
    })

export const deleteWorkspaceFileAction = new Action('deleteWorkspaceFileAction', { performsMutations: true })
    .params(z.object({ studyId: z.string(), fileName: z.string() }))
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('load', 'IDE')
    .middleware(requireChangeableCodeFiles(({ params }) => params.studyId))
    .handler(async ({ db, params: { studyId, fileName } }) => {
        const sanitized = sanitizeFileName(fileName)

        // Server-side so both files tables get the rule: /code disables the button, /resubmit's
        // table does not, and deleting it would leave main_code_file_name naming nothing.
        const study = await db
            .selectFrom('study')
            .select('mainCodeFileName')
            .where('id', '=', studyId)
            .executeTakeFirst()
        if (study?.mainCodeFileName === sanitized) {
            throw new Error('Main file cannot be deleted. Set another file as main first.')
        }

        await (await studyFileStore()).remove(studyId, sanitized)
        await stampLabEdit(db, studyId)

        return { success: true }
    })
