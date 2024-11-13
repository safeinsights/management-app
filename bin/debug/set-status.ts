import { DebugRequest } from './request'

const req = new DebugRequest()
req.program.option('-s, --status <status>', 'status to set').option('-r, --runId <runId>', 'runId to set status for')
req.parse()

const { status, runId } = req.program.opts()

req.path = `run/${runId}`
req.method = 'PUT'
req.body = { status }

req.perform().then((json) => {
    console.dir(json)
})
