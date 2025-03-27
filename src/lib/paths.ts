import type { MinimalJobInfo, MinimalJobResultsInfo, MinimalStudyInfo, StudyDocumentType } from '@/lib/types'
import { sanitizeFileName } from './util'

export const pathForStudy = (parts: MinimalStudyInfo) => `studies/${parts.memberIdentifier}/${parts.studyId}`

export const pathForStudyJob = (parts: MinimalJobInfo) => `${pathForStudy(parts)}/jobs/${parts.studyJobId}`

export const pathForStudyJobCode = (parts: MinimalJobInfo) => `${pathForStudyJob(parts)}/code`

export const pathForStudyJobCodeFile = (parts: MinimalJobInfo, fileName: string) =>
    `${pathForStudyJob(parts)}/${sanitizeFileName(fileName)}`

export const pathForStudyDocuments = (parts: MinimalStudyInfo, docType: StudyDocumentType, fileName: string) =>
    `${pathForStudy(parts)}/docs/${docType}/${sanitizeFileName(fileName)}`

export const pathForStudyJobResults = (parts: MinimalJobResultsInfo) =>
    `${pathForStudyJob(parts)}/results/${parts.resultsType == 'APPROVED' ? `approved/${parts.resultsPath}` : 'encrypted.zip'}`

export const resultsDownloadURL = (job: { id: string; resultsPath: string }) =>
    `/dl/results/${job.id}/${job.resultsPath}`
