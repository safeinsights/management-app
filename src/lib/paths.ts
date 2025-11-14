import type { MinimalJobInfo, MinimalOrgInfo, MinimalStudyInfo, StudyDocumentType } from '@/lib/types'
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

export const pathForStarterCode = ({ orgSlug, fileName }: MinimalOrgInfo & { fileName: string }) =>
    `starter-code/${orgSlug}/${fileName}`

export const resultsDownloadURL = (job: { id: string; resultsPath: string }) =>
    `/dl/results/${job.id}/${job.resultsPath}`

export const studyDocumentURL = (studyId: string, type: StudyDocumentType, fileName: string) =>
    `/dl/study-documents/${studyId}/${type}/${fileName}`

export const studyCodeURL = (jobId: string, fileName: string) => `/dl/study-code/${jobId}/${fileName}`

export const coderUserInfoPath = (username: string) => `/api/v2/users/${username}`
export const coderUsersPath = () => `/api/v2/users`
export const coderOrgsPath = () => `/api/v2/organizations`
export const coderTemplateId = () => `/api/v2/templates`
export const coderWorkspaceCreatePath = (organization: string, username: string) =>
    `/api/v2/organizations/${organization}/members/${username}/workspaces`
export const coderWorkspacePath = (username: string, workspaceName: string) =>
    `/@${username}/${workspaceName}.main/apps/code-server`
export const coderWorkspaceDataPath = (username: string, workspaceName: string) =>
    `/api/v2/users/${username}/workspace/${workspaceName}`
export const coderWorkspaceBuildPath = (workspaceId: string) => `/api/v2/workspaces/${workspaceId}/builds`

const NON_ORG_PREFIXES = ['about', 'account', 'dl', 'error-demo', 'dashboard']
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
