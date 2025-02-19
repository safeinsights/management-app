import type { MinimalJobInfo, MinimalJobResultsInfo } from '@/lib/types'
import { uuidToB64 } from './uuid'

export const pathForStudyJob = (parts: MinimalJobInfo) =>
    `analysis/${parts.memberIdentifier}/${parts.studyId}/${parts.studyJobId}`

export const pathForStudyJobCode = (parts: MinimalJobInfo) => `${pathForStudyJob(parts)}/code`

export const pathForStudyJobResults = (parts: MinimalJobResultsInfo) =>
    `${pathForStudyJob(parts)}/results/${parts.resultsPath}`

export const resultsDownloadURL = (job: { id: string; resultsPath: string }) =>
    `/dl/results/${uuidToB64(job.id)}/${job.resultsPath}`
