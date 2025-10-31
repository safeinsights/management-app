export const runtime = 'nodejs' // ensure Node runtime for streaming support

import { getConfigValue } from '@/server/config'
import { createParser, type EventSourceMessage } from 'eventsource-parser'

export interface CoderWorkspaceEvent {
    latest_build?: {
        resources?: CoderResource[]
    }
}

export interface CoderResource {
    agents?: CoderAgent[]
}

export interface CoderAgent {
    lifecycle_state?: string // e.g. "ready", "starting"
    status?: string // e.g. "connected"
    apps?: CoderApp[]
}

export interface CoderApp {
    slug: string // "code-server"
    health?: string // "healthy" | "unhealthy"
}

/**
 * Returns true if any agent has a healthy "code-server" app
 * and the agent itself is ready or connected.
 */
export function isCodeServerReady(event: CoderWorkspaceEvent): boolean {
    const resources = event.latest_build?.resources
    if (!resources) return false

    for (const resource of resources) {
        for (const agent of resource.agents ?? []) {
            const agentReady = agent.lifecycle_state === 'ready' || agent.status === 'connected'

            const codeServerApp = (agent.apps ?? []).find(
                (app) => app.slug === 'code-server' && app.health === 'healthy',
            )

            if (agentReady && codeServerApp) {
                return true
            }
        }
    }

    return false
}

export async function GET(req: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
    const workspaceId = (await params).workspaceId
    if (!workspaceId) return new Response('Missing workspace ID', { status: 400 })

    const CODER_API_ENDPOINT = process.env.CODER_API_ENDPOINT
    if (!CODER_API_ENDPOINT) throw new Error('CODER_API_ENDPOINT environment variable is not set')

    const CODER_TOKEN = await getConfigValue('CODER_TOKEN')

    const url = `${CODER_API_ENDPOINT}/api/v2/workspaces/${workspaceId}/watch`

    const coderResponse = await fetch(url, {
        headers: {
            Accept: 'text/event-stream',
            'Coder-Session-Token': CODER_TOKEN,
        },
    })

    if (!coderResponse.ok || !coderResponse.body) {
        console.error('Failed to connect to Coder SSE:', coderResponse.statusText)
        return new Response('Failed to watch workspace', { status: 500 })
    }

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
        async start(controller) {
            const send = (event: string, data: unknown) => {
                controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
            }

            const reader = coderResponse.body?.getReader()
            if (!reader) return

            const decoder = new TextDecoder()

            const parser = createParser({
                onEvent: (event: EventSourceMessage) => {
                    try {
                        const data = JSON.parse(event.data)
                        send('status', data)
                        if (isCodeServerReady(data)) {
                            // TODO build URL for workspace.
                            //  rework the `getStudyWorkspaceUrlAction` to be simpler?
                            send('ready', { url: data.url })
                            controller.close()
                        }
                    } catch (err) {
                        console.error('Error parsing SSE event data:', err)
                    }
                },
            })

            try {
                while (true) {
                    const { done, value } = await reader.read()
                    if (done) break

                    // Feed chunks to the parser
                    const chunk = decoder.decode(value, { stream: true })
                    parser.feed(chunk)
                }
            } catch (err) {
                console.error('Error reading Coder SSE stream:', err)
                send('error', { message: 'Stream error' })
            } finally {
                controller.close()
            }
        },
    })

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
        },
    })
}
