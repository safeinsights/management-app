import { DebugRequest, extractJobId } from './request'

const req = new DebugRequest()
req.program.requiredOption('-j, --jobId <jobId>', 'jobId or URL containing a jobId')
req.parse()

const jobId = extractJobId(req.program.opts().jobId)

req.path = `job/${jobId}/keys`
req.method = 'GET'
//req.body = { status }

req.perform().then((json) => {
    // eslint-disable-next-line no-console
    console.dir(json)
})
