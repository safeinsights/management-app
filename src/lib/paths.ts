import type { MinimalJobInfo, MinimalStudyInfo, StudyDocumentType } from '@/lib/types'
import { sanitizeFileName } from './util'

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

export const resultsDownloadURL = (job: { id: string; resultsPath: string }) =>
    `/dl/results/${job.id}/${job.resultsPath}`

export const studyDocumentURL = (studyId: string, type: StudyDocumentType, fileName: string) =>
    `/dl/study-documents/${studyId}/${type}/${fileName}`

export const studyCodeURL = (jobId: string, fileName: string) => `/dl/study-code/${jobId}/${fileName}`

export function extractOrgSlugFromPath(pathname: string) {
    const pathParts = pathname.split('/')
    if (pathParts.length >= 3) {
        if (pathParts[1] === 'admin' && pathParts[2] === 'team') {
            return pathParts[3]
        }
        if (pathParts[1] === 'reviewer' || pathParts[1] === 'dashboard') {
            return pathParts[2]
        }
        if (pathParts[1] === 'researcher') {
            if (pathParts[2] === 'study' && pathParts[3] === 'request' && pathParts[4]) return pathParts[4]
            if (pathParts[2] === 'study' && pathParts[4] === 'resubmit' && pathParts[5]) return pathParts[5]
        }
    }
    return undefined
}
