export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get("id")
  if (!workspaceId) return new Response("Missing workspace ID", { status: 400 })
    const CODER_API_ENDPOINT = process.env.CODER_API_ENDPOINT
    if (!CODER_API_ENDPOINT) {
        throw new Error('CODER_API_ENDPOINT environment variable is not set')
    }
  const encoder = new TextEncoder()
const stream = new ReadableStream({
    async start(controller) {
        const send = (event: string, data: unknown) => {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        }
        // Connect to Coder's WebSocket watcher
        const ws = new WebSocket(`wss:${CODER_API_ENDPOINT}/api/v2/workspaces/${workspaceId}/watch-ws`)

        ws.onmessage = (msg) => {
            const data = JSON.parse(msg.data)
            send('status', data)

            if (data.status === 'ready') {
                ws.close()
                controller.enqueue(encoder.encode(`data: done\n\n`))
                controller.close()
            }
        }

        ws.onerror = (err) => {
            send('error', { message: 'Websocket Error' })
            console.error(err)
            controller.close()
        }
    },
})

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  })
}
