import { DebugRequest, extractJobId } from './request'

const req = new DebugRequest()
req.program.requiredOption('-j, --jobId <jobId>', 'jobId or URL containing a jobId')
req.parse()

const jobId = extractJobId(req.program.opts().jobId)

req.path = `job/${jobId}/status`
req.method = 'GET'

req.perform().then((json) => {
    // eslint-disable-next-line no-console
    console.dir(json)
})
