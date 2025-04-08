import type { MinimalJobInfo, MinimalJobResultsInfo, MinimalStudyInfo, StudyDocumentType } from '@/lib/types'
import { sanitizeFileName } from './util'

export const pathForStudy = (parts: MinimalStudyInfo) => `studies/${parts.memberSlug}/${parts.studyId}`

export const pathForStudyJob = (parts: MinimalJobInfo) => `${pathForStudy(parts)}/jobs/${parts.studyJobId}`

export const pathForStudyJobCode = (parts: MinimalJobInfo) => `${pathForStudyJob(parts)}/code`

export const pathForStudyJobCodeFile = (parts: MinimalJobInfo, fileName: string) =>
    `${pathForStudyJobCode(parts)}/${sanitizeFileName(fileName)}`

export const pathForStudyDocuments = (parts: MinimalStudyInfo, docType: StudyDocumentType, fileName: string) =>
    `${pathForStudy(parts)}/docs/${docType}/${sanitizeFileName(fileName)}`

export const pathForStudyJobResults = (parts: MinimalJobResultsInfo) =>
    `${pathForStudyJob(parts)}/results/${parts.resultsType == 'APPROVED' ? `approved/${parts.resultsPath}` : 'encrypted.zip'}`

export const resultsDownloadURL = (job: { id: string; resultsPath: string }) =>
    `/dl/results/${job.id}/${job.resultsPath}`

export const studyDocumentURL = (studyId: string, type: StudyDocumentType, fileName: string) =>
    `/dl/study-documents/${studyId}/${type}/${fileName}`

export const studyCodeURL = (jobId: string, fileName: string) => `/dl/study-code/${jobId}/${fileName}`
