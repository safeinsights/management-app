export const runtime = 'nodejs' // ensure Node runtime for streaming support
import { generateWorkspaceUrl } from '@/server/coder'
import { getConfigValue } from '@/server/config'
import { createParser, type EventSourceMessage } from 'eventsource-parser'

export interface CoderWorkspaceEvent {
    latest_build?: {
        resources?: CoderResource[]
        workspace_owner_name?: string
        workspace_name?: string
    }
    url?: string
    message?: string
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

    const coderApiEndpoint = await getConfigValue('CODER_API_ENDPOINT')
    if (!coderApiEndpoint) throw new Error('CODER_API_ENDPOINT environment variable is not set')

    const coderToken = await getConfigValue('CODER_TOKEN')

    const url = `${coderApiEndpoint}/api/v2/workspaces/${workspaceId}/watch`

    const coderResponse = await fetch(url, {
        headers: {
            Accept: 'text/event-stream',
            'Coder-Session-Token': coderToken,
        },
    })

    if (!coderResponse.ok || !coderResponse.body) {
        console.error('Failed to connect to Coder SSE:', coderResponse.statusText)
        return new Response('Failed to watch workspace', { status: 500 })
    }

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
        async start(controller) {
            let username: string | undefined
            let workspaceName: string | undefined
            const send = (event: string, data: CoderWorkspaceEvent) => {
                if (data && data.latest_build) {
                    username = data.latest_build.workspace_owner_name
                    workspaceName = data.latest_build.workspace_name
                    console.warn('Coder SSE event:', data)
                }
                try {
                    controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
                } catch (error) {
                    console.error('Controller already closed! Falling back on prior workspace url', error)
                }
            }

            const reader = coderResponse.body?.getReader()
            if (!reader) return

            const decoder = new TextDecoder()

            const parser = createParser({
                onEvent: async (event: EventSourceMessage) => {
                    try {
                        const data = JSON.parse(event.data)
                        send('status', data)
                        if (isCodeServerReady(data)) {
                            if (username && workspaceName) {
                                console.warn('USER & WORKSPACE_NAME', username, workspaceName)
                                send('ready', { url: await generateWorkspaceUrl(username, workspaceName) })
                                controller.close()
                            }
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
