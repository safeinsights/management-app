'use server'

import { listStudyFiles } from '@/server/workspace-files'
import { getMicrovmConfig } from '@/server/microvm/config'
import { ensureMicrovm, getMicrovmLaunchStatus } from '@/server/microvm/workspaces'
import { Action, z } from './action'
import {
    copyStarterCodeIntoWorkspace,
    createUserAndWorkspace,
    getCoderWorkspaceLaunchStatus,
    type WorkspaceLaunchStatus,
} from '../coder'
import { CODER_DISABLED } from '@/server/config'
import {
    getInfoForStudyId,
    latestActivityPerWorkspaceFile,
    latestCodeSubmissionAt,
    latestSubmittedJobForStudy,
} from '@/server/db/queries'
import { ensureRoundJobForLaunch, getOrCreateCurrentRoundJob } from '@/server/db/mutations'
import { copyStarterCodeIntoDevWorkspace, initializeDevWorkspaceFiles } from '@/server/dev'
import type { WorkspaceFileActivitySummary, WorkspaceFileInfo } from '@/hooks/use-workspace-files'
import { type DBExecutor } from '@/database'
import { templateFileNameFor } from '@/lib/languages'
import { canResearcherChangeCodeFiles } from '@/lib/study-screen'
import { requireChangeableCodeFiles, studyCodeStateFor } from '@/server/study-code-gate'

async function studyHasWorkspaceFiles(studyId: string): Promise<boolean> {
    return (await listStudyFiles(studyId)).length > 0
}

async function workspaceFileActivityEntries(studyId: string, before?: Date) {
    return (await latestActivityPerWorkspaceFile(studyId, { before })).map(
        (row): [string, WorkspaceFileActivitySummary] => [
            row.fileName,
            { actorName: row.actorName, action: row.action, createdAt: row.createdAt.toISOString() },
        ],
    )
}

// Read by the post-submission table, which lists the job's files from S3 rather than the
// workspace. Bounded by the job's submission so it describes the files the table shows.
export const listWorkspaceFileActivityAction = new Action('listWorkspaceFileActivityAction', {})
    .params(z.object({ studyId: z.string(), jobId: z.string() }))
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('load', 'IDE')
    .handler(async ({ params: { studyId, jobId } }) => {
        const submittedAt = await latestCodeSubmissionAt(studyId, jobId)
        if (!submittedAt) return {}
        return Object.fromEntries(await workspaceFileActivityEntries(studyId, submittedAt))
    })

export const listWorkspaceFilesAction = new Action('listWorkspaceFilesAction', {})
    .params(z.object({ studyId: z.string() }))
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('load', 'IDE')
    .handler(async ({ params: { studyId } }) => {
        const activityByFile = new Map(await workspaceFileActivityEntries(studyId))

        const studyFiles = await listStudyFiles(studyId)
        const files: WorkspaceFileInfo[] = studyFiles.map((file) => ({
            name: file.name,
            size: file.size,
            mtime: file.mtime.toISOString(),
            lastActivity: activityByFile.get(file.name) ?? null,
        }))
        const lastModified = studyFiles.reduce<Date | null>(
            (latest, file) => (!latest || file.mtime > latest ? file.mtime : latest),
            null,
        )

        return {
            files,
            lastModified: lastModified?.toISOString() ?? null,
        }
    })

const requireIdeOwner = async (db: DBExecutor, studyId: string, userId: string) => {
    const { ideOwnerId } = await db
        .selectFrom('study')
        .select('ideOwnerId')
        .where('id', '=', studyId)
        .executeTakeFirstOrThrow()

    if (ideOwnerId !== userId) throw new Error('The IDE for this study is locked to another researcher')
}

// Kept out of the polled status action: the baseline reset and build POST must run once per
// launch, not on every refetch.
export const ensureWorkspaceAction = new Action('ensureWorkspaceAction', { performsMutations: true })
    .params(
        z.object({
            studyId: z.string().nonempty(),
        }),
    )
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('load', 'IDE')
    // A middleware, not an in-handler check: the claim below is irreversible, so a closed round has
    // to be refused before ideOwnerId is written.
    .middleware(requireChangeableCodeFiles(({ params }) => params.studyId))
    .handler(async ({ db, params: { studyId }, session }) => {
        if (!session) throw new Error('Unauthorized')

        // Every researcher with IDE access shares the study's one MicroVM and edits in it together,
        // so the one-owner lock below is Coder's alone.
        if (await getMicrovmConfig()) {
            const hasWorkspaceFiles = await studyHasWorkspaceFiles(studyId)
            await ensureRoundJobForLaunch(db, studyId, { hasWorkspaceFiles })
            const { microvmId } = await ensureMicrovm(studyId)
            return { success: true, workspace: { id: microvmId } }
        }

        // OTTER-693: claiming here rather than in the UI covers both entry points the card names,
        // since the Launch IDE button and the table's pencil both land on this action. The `is null`
        // guard is what makes it first-come: a later launch by anyone leaves the owner alone.
        await db
            .updateTable('study')
            .set({ ideOwnerId: session.user.id })
            .where('id', '=', studyId)
            .where('ideOwnerId', 'is', null)
            .execute()

        // Reading the claim back is what makes the lock real: 'load IDE' is granted to the whole
        // lab, and the Coder workspace is keyed on the study, so without this a teammate's launch
        // would hand them the owner's workspace.
        await requireIdeOwner(db, studyId, session.user.id)

        const hasWorkspaceFiles = await studyHasWorkspaceFiles(studyId)
        await ensureRoundJobForLaunch(db, studyId, { hasWorkspaceFiles })
        if (CODER_DISABLED) {
            return {
                success: true,
                workspace: { id: `dev-workspace-${studyId}` },
            }
        }
        return await createUserAndWorkspace(studyId)
    })

/**
 * OTTER-693: puts the Data Partner's template in the workspace before anyone launches an IDE, so
 * the Submit code page opens on a starred Main.{x} row rather than the empty state.
 *
 * Copies only into an empty workspace, which is what keeps it from resurrecting a template the
 * researcher replaced — and they cannot empty it by deleting the template, since a main file cannot
 * be deleted. The round job is ensured either way: the Template badge and the submit gate both
 * compare file mtimes against that baseline.
 */
export const ensureStarterCodePreloadAction = new Action('ensureStarterCodePreloadAction', {
    performsMutations: true,
})
    .params(z.object({ studyId: z.string().nonempty() }))
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('load', 'IDE')
    .handler(async ({ db, params: { studyId } }) => {
        // Skipped rather than refused: the page calls this on every load, and getOrCreateCurrentRoundJob
        // would otherwise mint a round job for a closed round as a side effect of merely looking.
        const state = await studyCodeStateFor(db, studyId)
        if (!state || !canResearcherChangeCodeFiles(state)) return { preloaded: false }

        await getOrCreateCurrentRoundJob(db, studyId)

        const templateName = CODER_DISABLED
            ? await copyStarterCodeIntoDevWorkspace(studyId, db)
            : await copyStarterCodeIntoWorkspace(studyId, db)
        if (!templateName) return { preloaded: false }

        // Starring it here rather than in the client: the card wants the main file marked on the
        // BE, and the page's existing saved-main-file branch then picks it up unchanged. Only when
        // nothing is starred yet, so this can never overwrite the researcher's own choice.
        await db
            .updateTable('study')
            .set({ mainCodeFileName: templateName })
            .where('id', '=', studyId)
            .where('mainCodeFileName', 'is', null)
            .execute()

        return { preloaded: true }
    })

const cursorsSchema = z
    .object({
        build: z.number().nullable(),
        agent: z.number().nullable(),
    })
    .optional()

export const getWorkspaceLaunchStatusAction = new Action('getWorkspaceLaunchStatusAction', {})
    .params(
        z.object({
            studyId: z.string().nonempty(),
            cursors: cursorsSchema,
        }),
    )
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('load', 'IDE')
    .handler(async ({ db, params: { studyId, cursors }, session }): Promise<WorkspaceLaunchStatus> => {
        if (!session) throw new Error('Unauthorized')

        // Shared by everyone with IDE access; see ensureWorkspaceAction.
        if (await getMicrovmConfig()) {
            const { fullName } = await db
                .selectFrom('user')
                .select('fullName')
                .where('id', '=', session.user.id)
                .executeTakeFirstOrThrow()
            return await getMicrovmLaunchStatus(studyId, { id: session.user.id, name: fullName })
        }

        // Defence in depth behind ensureWorkspaceAction: this hands back the workspace url, so it
        // must not answer a researcher the study's IDE is not locked to.
        await requireIdeOwner(db, studyId, session.user.id)

        if (CODER_DISABLED) {
            await initializeDevWorkspaceFiles(studyId)
            return {
                buildStatus: 'running',
                buildLogLines: [],
                agentStatus: null,
                agentLogLines: [],
                ready: true,
                failed: false,
                reason: 'dev workspace ready',
                cursors: { build: null, agent: null },
                url: `https://coder.dev.example.com/workspace/${studyId}`,
            }
        }
        return await getCoderWorkspaceLaunchStatus(studyId, cursors)
    })

export const getStarterCodeInfoAction = new Action('getStarterCodeInfoAction', {})
    .params(z.object({ studyId: z.string() }))
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('load', 'IDE')
    .handler(async ({ params: { studyId } }) => {
        const { fetchLatestCodeEnvForStudyId } = await import('@/server/db/queries')
        const codeEnv = await fetchLatestCodeEnvForStudyId(studyId)
        const fileNames = codeEnv.starterCodeFileNames ?? []
        if (fileNames.length === 0) return { starterFiles: [], templateFileName: null }

        // The workspace copy is renamed after the language, so this is the name the Template badge
        // has to match — starterFiles still carry the uploaded names, which is what S3 is keyed on.
        const templateFileName = templateFileNameFor(codeEnv.language)

        const { signedUrlForFile } = await import('@/server/aws')
        const { pathForStarterCode } = await import('@/lib/paths')
        // starterCodeFileNames holds bare names, not S3 keys.
        const starterFiles = await Promise.all(
            fileNames.map(async (fileName: string) => ({
                name: fileName,
                url: await signedUrlForFile(
                    pathForStarterCode({ orgSlug: codeEnv.slug, codeEnvId: codeEnv.id, fileName }),
                    { ResponseContentDisposition: 'inline' },
                ),
            })),
        )
        return { starterFiles, templateFileName }
    })

export const getLastSubmissionInfoAction = new Action('getLastSubmissionInfoAction', {})
    .params(z.object({ studyId: z.string() }))
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('load', 'IDE')
    .handler(async ({ db, params: { studyId } }) => {
        // Anchored on the last submission, not the round job's createdAt: a reused job's createdAt
        // no longer advances on relaunch, so Submit would re-enable with no edits (OTTER-601).
        const submittedJob = await latestSubmittedJobForStudy(studyId)

        if (submittedJob) {
            const submittedAt = submittedJob.statusChanges.find((s) => s.status === 'CODE-SUBMITTED')?.createdAt
            const codeFiles = submittedJob.files.filter(
                (f) => f.fileType === 'MAIN-CODE' || f.fileType === 'SUPPLEMENTAL-CODE',
            )
            return {
                createdAt: new Date(submittedAt ?? submittedJob.createdAt).toISOString(),
                mainFileName: codeFiles.find((f) => f.fileType === 'MAIN-CODE')?.name ?? null,
                fileNames: codeFiles.map((f) => f.name),
            }
        }

        const studyJob = await db
            .selectFrom('studyJob')
            .select(['createdAt'])
            .where('studyId', '=', studyId)
            .orderBy('id', 'desc')
            .executeTakeFirst()

        if (!studyJob) return null

        return {
            createdAt: studyJob.createdAt.toISOString(),
            mainFileName: null,
            fileNames: [],
        }
    })

/**
 * OTTER-693: who, if anyone, holds this study's IDE. `isOwnedByViewer` is resolved here rather than
 * handing the id to the client, so the UI never has to know the caller's own user id to decide
 * whether the pencil and Launch IDE are theirs to use.
 */
export const getIdeOwnerAction = new Action('getIdeOwnerAction', {})
    .params(z.object({ studyId: z.string() }))
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('load', 'IDE')
    .handler(async ({ db, params: { studyId }, session }) => {
        if (!session) throw new Error('Unauthorized')

        // Everyone with IDE access shares the study's MicroVM (see ensureWorkspaceAction), so to each
        // viewer it reads as theirs: the controls enable and the one-owner lock warning stays hidden.
        if (await getMicrovmConfig()) return { isClaimed: true, isOwnedByViewer: true, ownerName: null, isShared: true }

        const study = await db
            .selectFrom('study')
            .leftJoin('user', 'user.id', 'study.ideOwnerId')
            .select(['study.ideOwnerId', 'user.fullName as ownerName'])
            .where('study.id', '=', studyId)
            .executeTakeFirst()

        if (!study?.ideOwnerId) {
            return { isClaimed: false, isOwnedByViewer: false, ownerName: null, isShared: false }
        }

        return {
            isClaimed: true,
            isOwnedByViewer: study.ideOwnerId === session.user.id,
            ownerName: study.ownerName,
            isShared: false,
        }
    })
