'use server'

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { Action, z } from './action'
import { createUserAndWorkspace, getCoderWorkspaceLaunchStatus, type WorkspaceLaunchStatus } from '../coder'
import { CODER_DISABLED, getConfigValue } from '@/server/config'
import { getInfoForStudyId, latestActivityPerWorkspaceFile, latestSubmittedJobForStudy } from '@/server/db/queries'
import { ensureRoundJobForLaunch } from '@/server/db/mutations'
import { initializeDevWorkspaceFiles } from '@/server/dev'
import type { WorkspaceFileInfo } from '@/hooks/use-workspace-files'

// Mirrors listWorkspaceFilesAction's filtering, so "has files" matches what the table shows and
// what submit-enable is computed from.
async function studyHasWorkspaceFiles(studyId: string): Promise<boolean> {
    let coderFilesPath = await getConfigValue('CODER_FILES')
    if (!CODER_DISABLED) {
        coderFilesPath += `/${studyId}`
    }

    let entries: string[]
    try {
        entries = await fs.readdir(coderFilesPath)
    } catch (e) {
        if (e instanceof Error && 'code' in e && e.code === 'ENOENT') return false
        throw e
    }

    for (const entry of entries) {
        if (entry.startsWith('.')) continue
        try {
            const stats = await fs.lstat(path.join(coderFilesPath, entry))
            if (stats.isSymbolicLink() || !stats.isFile() || stats.size === 0) continue
            return true
        } catch {
            continue
        }
    }
    return false
}

export const listWorkspaceFilesAction = new Action('listWorkspaceFilesAction', {})
    .params(z.object({ studyId: z.string() }))
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('load', 'IDE')
    .handler(async ({ params: { studyId } }) => {
        const activityByFile = new Map(
            (await latestActivityPerWorkspaceFile(studyId)).map((row) => [
                row.fileName,
                { actorName: row.actorName, action: row.action, createdAt: row.createdAt.toISOString() },
            ]),
        )

        let coderFilesPath = await getConfigValue('CODER_FILES')
        if (!CODER_DISABLED) {
            coderFilesPath += `/${studyId}`
        }

        let entries: string[] = []
        try {
            entries = await fs.readdir(coderFilesPath)
        } catch (e) {
            if (e instanceof Error && 'code' in e && e.code === 'ENOENT') {
                return {
                    files: [],
                    lastModified: null,
                }
            }
            throw e
        }

        const files: WorkspaceFileInfo[] = []
        let lastModified: Date | null = null

        for (const entry of entries) {
            if (entry.startsWith('.')) continue

            const filePath = path.join(coderFilesPath, entry)
            let stats
            try {
                stats = await fs.lstat(filePath)
            } catch {
                continue
            }

            if (stats.isSymbolicLink()) continue
            if (!stats.isFile()) continue
            if (stats.size === 0) continue

            files.push({
                name: entry,
                size: stats.size,
                mtime: stats.mtime.toISOString(),
                lastActivity: activityByFile.get(entry) ?? null,
            })

            if (!lastModified || stats.mtime > lastModified) {
                lastModified = stats.mtime
            }
        }

        return {
            files,
            lastModified: lastModified?.toISOString() ?? null,
        }
    })

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
    .handler(async ({ db, params: { studyId }, session }) => {
        if (!session) throw new Error('Unauthorized')

        // OTTER-693: claiming here rather than in the UI covers both entry points the card names,
        // since the Launch IDE button and the table's pencil both land on this action. The `is null`
        // guard is what makes it first-come: a later launch by anyone leaves the owner alone.
        await db
            .updateTable('study')
            .set({ ideOwnerId: session.user.id })
            .where('id', '=', studyId)
            .where('ideOwnerId', 'is', null)
            .execute()

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
    .handler(async ({ params: { studyId, cursors }, session }): Promise<WorkspaceLaunchStatus> => {
        if (!session) throw new Error('Unauthorized')
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
        if (fileNames.length === 0) return { starterFiles: [] }

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
        return { starterFiles }
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

        const study = await db
            .selectFrom('study')
            .leftJoin('user', 'user.id', 'study.ideOwnerId')
            .select(['study.ideOwnerId', 'user.fullName as ownerName'])
            .where('study.id', '=', studyId)
            .executeTakeFirst()

        if (!study?.ideOwnerId) {
            return { isClaimed: false, isOwnedByViewer: false, ownerName: null }
        }

        return {
            isClaimed: true,
            isOwnedByViewer: study.ideOwnerId === session.user.id,
            ownerName: study.ownerName,
        }
    })
