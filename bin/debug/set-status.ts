import { DebugRequest, extractJobId } from './request'

const req = new DebugRequest()
req.program
    .option('-s, --status <status>', 'status to set')
    .option('-j, --jobId <jobId>', 'jobId or URL containing a jobId')
req.parse()

const { status } = req.program.opts()
const jobId = extractJobId(req.program.opts().jobId)

req.path = `job/${jobId}`
req.method = 'PUT'
req.body = { status }

req.perform().then((json) => {
    // eslint-disable-next-line no-console
    console.dir(json)
})
