import { DebugRequest } from './request'

const req = new DebugRequest('studies/ready')

req.parse()
    .perform()
    .then((json) => {
        // eslint-disable-next-line no-console
        console.dir(json)
    })
