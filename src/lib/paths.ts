import type { MinimalJobInfo, MinimalJobResultsInfo, MinimalStudyInfo } from '@/lib/types'

export const pathForStudy = (parts: MinimalStudyInfo) => `studies/${parts.memberIdentifier}/${parts.studyId}`

export const pathForStudyJob = (parts: MinimalJobInfo) => `${pathForStudy(parts)}/jobs/${parts.studyJobId}`

export const pathForStudyJobCode = (parts: MinimalJobInfo) => `${pathForStudyJob(parts)}/code`

export const pathForStudyDocuments = (parts: MinimalStudyInfo) => `${pathForStudy(parts)}/docs`

export const pathForStudyJobResults = (parts: MinimalJobResultsInfo) =>
    `${pathForStudyJob(parts)}/results/${parts.resultsType == 'APPROVED' ? `approved/${parts.resultsPath}` : 'encypted.zip'}`

export const resultsDownloadURL = (job: { id: string; resultsPath: string }) =>
    `/dl/results/${job.id}/${job.resultsPath}`
