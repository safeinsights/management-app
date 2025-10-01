import { DebugRequest } from './request'

const req = new DebugRequest()
req.program.option('-s, --status <status>', 'status to set').option('-j, --jobId <jobId>', 'jobId to set status for')
req.parse()

const { status, jobId } = req.program.opts()

req.path = `job/${jobId}`
req.method = 'PUT'
req.body = { status }

req.perform().then((json) => {
    // eslint-disable-next-line no-console
    console.dir(json)
})
