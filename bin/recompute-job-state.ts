/* eslint-disable no-console */
// Repairs current_status, round and status_changed_at of hand-edited jobs with the backfill of migration
// 1787900000000 (OTTER-973). Idempotent, not a deploy step: the migration's triggers keep inserted rows right.
// Usage: pnpm exec tsx bin/recompute-job-state.ts [--study <studyId>] [--dry-run], where --dry-run only prints.
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
