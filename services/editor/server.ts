import { Server } from '@hocuspocus/server'
import type { IncomingMessage, ServerResponse } from 'http'

const server = new Server({
    port: 1234,
    async onRequest({ request, response }: { request: IncomingMessage; response: ServerResponse }) {
        if (request.url === '/health') {
            response.writeHead(200, { 'Content-Type': 'text/plain' })
            response.end('ok')
        }
    },
})

server.listen()
