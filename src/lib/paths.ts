import type { MinimalRunInfo, MinimalRunResultsInfo } from '@/lib/types'
import { uuidToB64 } from './uuid'

export const pathForStudyRun = (parts: MinimalRunInfo) =>
    `analysis/${parts.memberIdentifier}/${parts.studyId}/${parts.studyRunId}`

export const pathForStudyRunResults = (parts: MinimalRunResultsInfo) =>
    `${pathForStudyRun(parts)}/results/${parts.resultsPath}`

export const resultsDownloadURL = (run: { id: string; resultsPath: string }) =>
    `/dl/results/${uuidToB64(run.id)}/${run.resultsPath}`
