import 'dotenv/config'
import fs from 'fs'
import { Command } from 'commander'
import { extractJobId } from './request'

// Upload a code security scan log for a job via the job-scan-results webhook
// npx tsx bin/debug/upload-scan-log.ts -j <jobId> -l tests/assets/error-log.txt
// npx tsx bin/debug/upload-scan-log.ts -j <jobId> -l tests/assets/error-log.txt -s CODE-SCANNED
// npx tsx bin/debug/upload-scan-log.ts -j <jobId> -l tests/assets/error-log.txt -s JOB-ERRORED

const program = new Command()
program
    .option('-j, --jobId <jobId>', 'jobId or URL containing a jobId')
    .option('-l, --logFile <path/to/file>', 'plaintext log file to upload')
    .option('-s, --status <status>', 'job status to set (CODE-SCANNED or JOB-ERRORED)', 'CODE-SCANNED')
    .option('-u, --url <url>', 'base URL', 'http://localhost:4000')
    .option('-t, --token <secret>', 'webhook secret (or set CODEBUILD_WEBHOOK_SECRET env var)')
    .parse(process.argv)

const opts = program.opts()

if (!opts.jobId || !opts.logFile) {
    console.error('must supply --jobId and --logFile')
    process.exit(1)
}

const jobId = extractJobId(opts.jobId)

const token = opts.token || process.env.CODEBUILD_WEBHOOK_SECRET
if (!token) {
    console.error('must supply --token or set CODEBUILD_WEBHOOK_SECRET env var')
    process.exit(1)
}

const plaintextLog = fs.readFileSync(opts.logFile, 'utf8')

const body = {
    jobId,
    status: opts.status,
    plaintextLog,
}

fetch(`${opts.url}/api/services/job-scan-results`, {
    method: 'POST',
    headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
}).then(async (response) => {
    if (!response.ok) {
        console.error(`HTTP error! status: ${response.status} ${response.statusText} ${await response.text()}`)
        process.exit(1)
    }
    // eslint-disable-next-line no-console
    console.info(
        `Scan log uploaded for job ${jobId} with status ${opts.status}\nResults must be decrypted using ONLY tests/support/private_key.pem.  normal reviewer keys will not work.  use:\ncat tests/support/private_key.pem | pbcopy`,
    )
})
