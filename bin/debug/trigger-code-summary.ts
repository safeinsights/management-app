/**
 * Manually triggers code summary generation for a study job.
 * Usage: npx tsx bin/debug/trigger-code-summary.ts <studyJobId>
 */
import { generateAndStoreCodeSummary } from '@/server/claude/code-summary'

const studyJobId = process.argv[2]
if (!studyJobId) {
    console.error('Usage: npx tsx bin/debug/trigger-code-summary.ts <studyJobId>')
    process.exit(1)
}

console.log(`Triggering code summary for studyJobId: ${studyJobId}`)
await generateAndStoreCodeSummary(studyJobId)
console.log('Done')
process.exit(0)
