import { DebugRequest } from './request'

const req = new DebugRequest()
req.program.requiredOption('-j, --jobId <jobId>', 'jobId to get status for')
req.parse()

const { _, jobId } = req.program.opts()

req.path = `job/${jobId}/status`
req.method = 'GET'

req.perform().then((json) => {
    console.dir(json)
})
