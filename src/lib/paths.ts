import type { LegalDocumentType } from '@/database/types'
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

// The versionId is the whole key: drafts have no version number yet, and one object per version
// stops a replacement draft colliding with a published file.
export const pathForLegalDocumentVersion = (parts: {
    type: LegalDocumentType
    legalDocumentId: string
    versionId: string
}) => `legal/${parts.type}/${parts.legalDocumentId}/${parts.versionId}`

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

// Callers prefix APP_BASE_URL to make it absolute.
export const pathForInvitation = (inviteId: string) => `/account/invitation/${inviteId}`

// Everything under here answers with an attachment rather than a document, which callers that
// navigate (rather than link) have to know about: the browser keeps the current page mounted.
export const DOWNLOAD_PREFIX = '/dl/'

export const resultsDownloadURL = (job: { id: string; resultsPath: string }) =>
    `${DOWNLOAD_PREFIX}results/${job.id}/${job.resultsPath}`

export const studyDocumentURL = (studyId: string, type: StudyDocumentType, fileName: string) =>
    `${DOWNLOAD_PREFIX}study-documents/${studyId}/${type}/${fileName}`

export const studyCodeURL = (jobId: string, fileName: string) => `${DOWNLOAD_PREFIX}study-code/${jobId}/${fileName}`

export const scanLogDownloadURL = (jobId: string) => `${DOWNLOAD_PREFIX}scan-log/${jobId}`

// Stored objects carry an opaque S3 key, so the name the reviewer sees — in the download's
// Content-Disposition and as the in-app viewer's title — is supplied here rather than by storage.
export const SCAN_LOG_FILE_NAME = 'security-scan-log.txt'

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

// Coder log endpoints accept an `after` log id to fetch only newer lines.
const withAfter = (path: string, after?: number | null) => (after != null ? `${path}?after=${after}` : path)
export const coderWorkspaceBuildLogsPath = (buildId: BuildId, after?: number | null) =>
    withAfter(`/api/v2/workspacebuilds/${buildId}/logs`, after)
export const coderWorkspaceAgentLogsPath = (agentId: AgentId, after?: number | null) =>
    withAfter(`/api/v2/workspaceagents/${agentId}/logs`, after)

// '404' is Routes.notFound: without it the proxy's org-membership guard reads `/404` as an org
// slug and redirects the not-found page to the dashboard for everyone but SI admins.
const NON_ORG_PREFIXES = [
    'about',
    'account',
    'dl',
    'editor-demo',
    'dashboard',
    'researcher',
    'user-key',
    'legal',
    'admin',
    '404',
]
export function extractOrgSlugFromPath(pathname: string) {
    const parts = pathname.split('/').slice(1)
    if (NON_ORG_PREFIXES.includes(parts[0])) {
        return null
    }

    return parts[0] || null
}

export function basename(path: string) {
    const parts = path.split('/')
    return parts[parts.length - 1]
}

export function bareExtension(fileName: string): string {
    return fileName.split('.').pop()?.toLowerCase() ?? ''
}
