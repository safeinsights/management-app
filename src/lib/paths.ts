import type { MinimalJobInfo, MinimalJobResultsInfo } from '@/lib/types'

export const pathForStudyJob = (parts: MinimalJobInfo) =>
    `analysis/${parts.memberIdentifier}/${parts.studyId}/${parts.studyJobId}`

export const pathForStudyJobCode = (parts: MinimalJobInfo) => `${pathForStudyJob(parts)}/code`

export const pathForStudyJobResults = (parts: MinimalJobResultsInfo) =>
    `${pathForStudyJob(parts)}/results/${parts.resultsPath}`

export const resultsDownloadURL = (job: { id: string; resultsPath: string }) =>
    `/dl/results/${job.id}/${job.resultsPath}`
