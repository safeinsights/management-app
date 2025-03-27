import { DebugRequest } from './request'


const req = new DebugRequest()
req.program.requiredOption('-j, --jobId <jobId>', 'jobId to get keys for')
req.parse()

const { status, jobId } = req.program.opts()

req.path = `job/${jobId}/keys`
req.method = 'GET'
//req.body = { status }

req.perform().then((json) => {
    console.dir(json)
})

