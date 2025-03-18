import type { MinimalJobInfo, MinimalJobResultsInfo, MinimalStudyInfo } from '@/lib/types'
import { uuidToB64 } from './uuid'

export const pathForStudy = (parts: MinimalStudyInfo) => `studies/${parts.memberIdentifier}/${parts.studyId}`

export const pathForStudyJob = (parts: MinimalJobInfo) => `${pathForStudy(parts)}/jobs/${parts.studyJobId}`

export const pathForStudyJobCode = (parts: MinimalJobInfo) => `${pathForStudyJob(parts)}/code`

export const pathForStudyDocuments = (parts: MinimalStudyInfo) => `${pathForStudy(parts)}/docs`

export const pathForStudyJobResults = (parts: MinimalJobResultsInfo) =>
    `${pathForStudyJob(parts)}/results/${parts.resultsPath}`

export const resultsDownloadURL = (job: { id: string; resultsPath: string }) =>
    `/dl/results/${uuidToB64(job.id)}/${job.resultsPath}`
