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
