import { DebugRequest } from './request'

const req = new DebugRequest('studies/runnable')

req.parse()
    .perform()
    .then((json) => {
        console.dir(json)
    })
