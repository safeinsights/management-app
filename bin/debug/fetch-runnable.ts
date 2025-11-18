import { DebugRequest } from './request'

const req = new DebugRequest('studies/ready')

req.parse()
    .perform()
    .then((json) => {
        console.dir(json)
    })
