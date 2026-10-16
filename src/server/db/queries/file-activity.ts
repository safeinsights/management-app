import { currentDb } from '@/server/request-context'
import { StudyJobFileAction, WorkspaceFileAction } from '@/database/types'

// Most recent view/download per output file. DISTINCT ON collapses each file to its newest row
// because the column reports the latest action, not a history (OTTER-675).
export type JobFileActivity = {
    studyJobFileId: string
    filePath: string
    action: StudyJobFileAction
    createdAt: Date
    actorName: string
}

// Scoped to one side of the study: the Data Partner never sees the lab's activity and vice versa
// (OTTER-783).
export async function latestActivityPerJobFile(jobId: string, orgId: string): Promise<JobFileActivity[]> {
    return await currentDb()
        .selectFrom('studyJobFileActivity')
        .innerJoin('studyJobFile', 'studyJobFile.id', 'studyJobFileActivity.studyJobFileId')
        .innerJoin('user', 'user.id', 'studyJobFileActivity.userId')
        .where('studyJobFile.studyJobId', '=', jobId)
        .where('studyJobFileActivity.orgId', '=', orgId)
        .select([
            'studyJobFileActivity.studyJobFileId',
            'studyJobFileActivity.filePath',
            'studyJobFileActivity.action',
            'studyJobFileActivity.createdAt',
            'user.fullName as actorName',
        ])
        .distinctOn(['studyJobFileActivity.studyJobFileId', 'studyJobFileActivity.filePath'])
        .orderBy('studyJobFileActivity.studyJobFileId')
        .orderBy('studyJobFileActivity.filePath')
        .orderBy('studyJobFileActivity.createdAt', 'desc')
        .orderBy('studyJobFileActivity.id', 'desc')
        .execute()
}

/**
 * OTTER-693: whether this researcher has already been shown the Submit code page's FAQ.
 *
 * Filters in the same order as the last-login read, so it rides audit_last_login_idx
 * (record_type, event_type, record_id) and only the handful of rows that survives is checked
 * against the metadata subject.
 */

// The workspace-file counterpart of latestActivityPerJobFile: same DISTINCT ON collapse, keyed on
// (study, file name) because a workspace file is a path on disk rather than a row (OTTER-693).
export type WorkspaceFileActivityRow = {
    fileName: string
    action: WorkspaceFileAction
    createdAt: Date
    actorName: string
}

// `before` bounds it to a submission, so edits from a later round never show against older files.
export async function latestActivityPerWorkspaceFile(
    studyId: string,
    { before }: { before?: Date } = {},
): Promise<WorkspaceFileActivityRow[]> {
    return await currentDb()
        .selectFrom('workspaceFileActivity')
        .innerJoin('user', 'user.id', 'workspaceFileActivity.userId')
        .where('workspaceFileActivity.studyId', '=', studyId)
        .$if(before !== undefined, (qb) => qb.where('workspaceFileActivity.createdAt', '<=', before!))
        .select([
            'workspaceFileActivity.fileName',
            'workspaceFileActivity.action',
            'workspaceFileActivity.createdAt',
            'user.fullName as actorName',
        ])
        .distinctOn(['workspaceFileActivity.fileName'])
        .orderBy('workspaceFileActivity.fileName')
        .orderBy('workspaceFileActivity.createdAt', 'desc')
        .orderBy('workspaceFileActivity.id', 'desc')
        .execute()
}
