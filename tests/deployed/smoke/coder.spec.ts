import { expect, test } from '../fixtures'

// Coder behind its own load balancer at coder.<zone>: the service answers, and the name the app
// launches workspaces through is Coder's, not a stale record pointing somewhere else.

test('coder is up at its hostname', async ({ request, target }) => {
    const health = await request.get(`${target.coderURL}/healthz`)
    expect(health.status(), await health.text()).toBe(200)

    const info = await request.get(`${target.coderURL}/api/v2/buildinfo`)
    expect(info.status()).toBe(200)
    expect((JSON.parse(await info.text()) as { version?: string }).version).toMatch(/^v?\d+\.\d+/)
})
