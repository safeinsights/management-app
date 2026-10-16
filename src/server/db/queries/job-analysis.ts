import { jsonArrayFrom } from '@/database'
import { currentDb } from '@/server/request-context'
import { FileType } from '@/database/types'
import { codeRoundForJob } from '../code-round'
import { isStudyReviewStale } from '@/lib/study-review'
import { fetchFileContents } from '@/server/storage'
import type { AnalysisReport } from '@/server/agents/review-agent/types'

export type StudyReviewWithMeta = {
    // null on a failure row (summaryFailedAt set), and on a pending row, where generation has
    // claimed the round but has not finished.
    report: AnalysisReport | null
    createdAt: Date
    summaryFailedAt: Date | null
    summaryStartedAt: Date | null
    // Judged here rather than in the browser, so a reviewer's clock cannot call a live run dead.
    isStale: boolean
    files: { name: string; fileType: FileType }[]
}

// INDETERMINATE means the tool reported without a verdict. NOT-RUN means its header is absent.
export type ScanToolStatus = 'PASSED' | 'FAILED' | 'INDETERMINATE' | 'NOT-RUN'

export type JobScanResult = {
    // null means no readable log. NOT-RUN means the readable log has no header for this tool.
    semgrep: ScanToolStatus | null
    // The scan log for the reviewer, without a status line the verdict already shows.
    details: string | null
    // Present only when a downloadable plaintext scan log exists (ZIPs are not offered).
    logFile: { id: string; name: string; path: string } | null
}

// Unrecognized text is indeterminate, not FAILED: treating it as FAILED surfaced a scan that never
// ran as a vulnerability finding. Maps, not object literals, so `constructor` cannot look truthy.
const SEMGREP_VERDICTS = new Map<string, ScanToolStatus>([
    ['no findings', 'PASSED'],
    ['findings found', 'FAILED'],
])
const SEMGREP_STATUS_LINE = /^semgrep scan:/i

const trimmedLines = (log: string | string[]) =>
    typeof log === 'string' ? log.split('\n').map((line) => line.trim()) : log

export function parseSemgrepStatus(log: string | string[]): ScanToolStatus {
    // Only the first non-empty line can supply a verdict; paths and finding details cannot.
    const statusLine = trimmedLines(log).find((line) => line.length > 0)
    if (!statusLine || !SEMGREP_STATUS_LINE.test(statusLine)) return 'NOT-RUN'
    const phrase = statusLine.replace(SEMGREP_STATUS_LINE, '').trim().toLowerCase()
    return SEMGREP_VERDICTS.get(phrase) ?? 'INDETERMINATE'
}

// A pass or fail status line is already shown as the verdict. Any other first line says why there
// is no verdict, so it stays.
export function scanLogDetails(log: string): string | null {
    const lines = log.split('\n')
    const status = parseSemgrepStatus(log)
    const statusIndex = lines.findIndex((line) => line.trim().length > 0)
    const rest = status === 'PASSED' || status === 'FAILED' ? lines.slice(statusIndex + 1) : lines
    return rest.join('\n').trim() || null
}

// No log row yet, or an unreadable file, is treated as "not reported".
export async function jobScanResultForJob(studyJobId: string): Promise<JobScanResult> {
    const logFile = await currentDb()
        .selectFrom('studyJobFile')
        .select(['id', 'name', 'path'])
        .where('studyJobId', '=', studyJobId)
        .where('fileType', '=', 'SECURITY-SCAN-LOG')
        .orderBy('createdAt', 'desc')
        .orderBy('id', 'desc')
        .limit(1)
        .executeTakeFirst()

    if (!logFile) return { semgrep: null, details: null, logFile: null }

    try {
        const blob = await fetchFileContents(logFile.path)
        const log = await blob.text()
        return { semgrep: parseSemgrepStatus(trimmedLines(log)), details: scanLogDetails(log), logFile }
    } catch {
        // The download route serves the file from the DB row + a signed URL, so keep it available
        // with unknown statuses rather than pretending the scan is pending.
        return { semgrep: null, details: null, logFile }
    }
}

// The job's round is resolved from its status history in the database, so the id is all a caller
// has to supply. The id key differs by query, since getStudyJobInfo aliases it to studyJobId, so
// either spelling is accepted.
export type JobForRound = { id: string } | { studyJobId: string }

const jobRowId = (job: JobForRound) => ('id' in job ? job.id : job.studyJobId)

export async function getStudyReviewForJob(job: JobForRound): Promise<StudyReviewWithMeta | null> {
    const studyJobId = jobRowId(job)
    // A resubmit reuses the job, so the id alone matches every round it has been through. Only the
    // summary written for the code now on the job is current (OTTER-779).
    const round = await codeRoundForJob(studyJobId, currentDb())
    const row = await currentDb()
        .selectFrom('studyReview')
        .select((eb) => [
            eb.ref('report').$castTo<AnalysisReport | null>().as('report'),
            'createdAt',
            'summaryFailedAt',
            'summaryStartedAt',
            jsonArrayFrom(
                eb
                    .selectFrom('studyJobFile')
                    .select(['name', 'fileType'])
                    .whereRef('studyJobFile.studyJobId', '=', 'studyReview.studyJobId')
                    .where('fileType', 'in', ['MAIN-CODE', 'SUPPLEMENTAL-CODE'])
                    .orderBy('fileType', 'desc')
                    .orderBy('name', 'asc'),
            ).as('files'),
        ])
        .where('studyJobId', '=', studyJobId)
        .where('round', '=', round)
        .executeTakeFirst()

    return row ? { ...row, isStale: isStudyReviewStale(row) } : null
}

export type JobAnalysis = { review: StudyReviewWithMeta | null; scan: JobScanResult }

export async function jobAnalysisForJob(job: JobForRound): Promise<JobAnalysis> {
    const [review, scan] = await Promise.all([getStudyReviewForJob(job), jobScanResultForJob(jobRowId(job))])
    return { review, scan }
}
