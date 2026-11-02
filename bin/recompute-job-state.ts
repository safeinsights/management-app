/* eslint-disable no-console */
/**
 * Rewrites study_job.current_status, round and status_changed_at from each job's status log
 * (OTTER-973). The status writer repairs a job on its next write; this repairs every job at once, for
 * example after a release in which older code wrote log rows without the columns. Idempotent.
 *
 *   pnpm exec tsx bin/recompute-job-state.ts [--study <studyId>] [--dry-run]
 *
 * --dry-run prints the jobs that would change and writes nothing.
 */
import { db } from '@/database'
import { recomputeJobStates } from '@/database/job-status-writer'

function parseArgs(argv: string[]) {
    const studyIndex = argv.indexOf('--study')
    return {
        studyId: studyIndex >= 0 ? argv[studyIndex + 1] : undefined,
        dryRun: argv.includes('--dry-run'),
    }
}

async function main() {
    const { studyId, dryRun } = parseArgs(process.argv.slice(2))
    const changed = await recomputeJobStates(db, { studyId, dryRun })
    for (const job of changed) {
        console.info(`${job.jobId}: ${job.status}, round ${job.round}, since ${job.statusChangedAt.toISOString()}`)
    }
    console.info(`${changed.length} job(s) ${dryRun ? 'would change' : 'repaired'}`)
    await db.destroy()
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
