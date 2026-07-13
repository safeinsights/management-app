import type { MinimalCodeEnvInfo, MinimalJobInfo, MinimalStudyInfo, StudyDocumentType } from '@/lib/types'
import type { AgentId, BuildId, CoderUsername, WorkspaceId } from '@/server/coder/types'
import { sanitizeFileName } from './utils'

export const pathForStudy = (parts: MinimalStudyInfo) => `studies/${parts.orgSlug}/${parts.studyId}`

export const pathForStudyJob = (parts: MinimalJobInfo) => `${pathForStudy(parts)}/jobs/${parts.studyJobId}`

export const pathForStudyJobFile = (parts: MinimalJobInfo, file: { path: string }) =>
    `${pathForStudyJob(parts)}/${file.path}`

export const pathForStudyJobCode = (parts: MinimalJobInfo) => `${pathForStudyJob(parts)}/code`

export const pathForStudyJobCodeFile = (parts: MinimalJobInfo, fileName: string) =>
    `${pathForStudyJobCode(parts)}/${sanitizeFileName(fileName)}`

export const pathForStudyDocuments = (parts: MinimalStudyInfo, docType: StudyDocumentType) =>
    `${pathForStudy(parts)}/docs/${docType}`

export const pathForStudyDocumentFile = (parts: MinimalStudyInfo, docType: StudyDocumentType, fileName: string) =>
    `${pathForStudyDocuments(parts, docType)}/${sanitizeFileName(fileName)}`

const pathForCodeEnv = (parts: MinimalCodeEnvInfo) => `code-env/${parts.orgSlug}/${parts.codeEnvId}`

export const pathForStarterCodePrefix = (parts: MinimalCodeEnvInfo) => `${pathForCodeEnv(parts)}/starter-code`

export const pathForStarterCode = (parts: MinimalCodeEnvInfo & { fileName: string }) =>
    `${pathForStarterCodePrefix(parts)}/${parts.fileName}`

export const pathForSampleData = (parts: MinimalCodeEnvInfo & { sampleDataPath?: string | null }) => {
    const base = `${pathForCodeEnv(parts)}/sample-data`
    return parts.sampleDataPath ? `${base}/${parts.sampleDataPath}` : base
}

export const pathForJobScanArtifacts = (parts: { studyJobId: string }) => `scan-artifacts/jobs/${parts.studyJobId}`

export const pathForCodeEnvScanArtifacts = (parts: { codeEnvId: string }) =>
    `scan-artifacts/code-env/${parts.codeEnvId}`

export const resultsDownloadURL = (job: { id: string; resultsPath: string }) =>
    `/dl/results/${job.id}/${job.resultsPath}`

export const studyDocumentURL = (studyId: string, type: StudyDocumentType, fileName: string) =>
    `/dl/study-documents/${studyId}/${type}/${fileName}`

export const studyCodeURL = (jobId: string, fileName: string) => `/dl/study-code/${jobId}/${fileName}`

export const scanLogDownloadURL = (jobId: string) => `/dl/scan-log/${jobId}`

export const coderUserInfoPath = (username: CoderUsername) => `/api/v2/users/${username}`
export const coderUsersPath = () => `/api/v2/users`
export const coderOrgsPath = () => `/api/v2/organizations`
export const coderTemplateId = () => `/api/v2/templates`
export const coderWorkspaceCreatePath = (organization: string, username: CoderUsername) =>
    `/api/v2/organizations/${organization}/members/${username}/workspaces`
export const coderWorkspacePath = (username: CoderUsername, workspaceName: string) =>
    `/@${username}/${workspaceName}.main/apps/code-server`
export const coderWorkspaceDataPath = (username: CoderUsername, workspaceName: string) =>
    `/api/v2/users/${username}/workspace/${workspaceName}`
export const coderWorkspaceBuildPath = (workspaceId: WorkspaceId) => `/api/v2/workspaces/${workspaceId}/builds`
export const coderWorkspaceBuildByIdPath = (buildId: BuildId) => `/api/v2/workspacebuilds/${buildId}`

// Coder log endpoints accept an `after` log id to fetch only newer lines; omit it for the full log.
const withAfter = (path: string, after?: number | null) => (after != null ? `${path}?after=${after}` : path)
export const coderWorkspaceBuildLogsPath = (buildId: BuildId, after?: number | null) =>
    withAfter(`/api/v2/workspacebuilds/${buildId}/logs`, after)
export const coderWorkspaceAgentLogsPath = (agentId: AgentId, after?: number | null) =>
    withAfter(`/api/v2/workspaceagents/${agentId}/logs`, after)

const NON_ORG_PREFIXES = ['about', 'account', 'dl', 'error-demo', 'dashboard', 'researcher', 'user-key', 'admin']
export function extractOrgSlugFromPath(pathname: string) {
    const parts = pathname.split('/').slice(1)
    if (NON_ORG_PREFIXES.includes(parts[0])) {
        return null
    }

    return parts[0]
}

export function basename(path: string) {
    const parts = path.split('/')
    return parts[parts.length - 1]
}

export function bareExtension(fileName: string): string {
    return fileName.split('.').pop()?.toLowerCase() ?? ''
}
