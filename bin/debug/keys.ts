import { DebugRequest } from './request'

const req = new DebugRequest()
req.program.requiredOption('-j, --jobId <jobId>', 'jobId to get keys for')
req.parse()

const { jobId } = req.program.opts()

req.path = `job/${jobId}/keys`
req.method = 'GET'
//req.body = { status }

req.perform().then((json) => {
    // eslint-disable-next-line no-console
    console.dir(json)
})
