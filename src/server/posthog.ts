import { getConfigValue } from './config'
import { PostHog } from 'posthog-node'
import { POSTHOG_HOST } from '@/lib/constants'

let client: PostHog | null = null

async function getPostHogClient(): Promise<PostHog | null> {
    if (client) return client

    const postHogProjectToken = await getConfigValue('POSTHOG_PROJECT_TOKEN', false)
    if (!postHogProjectToken) return null

    // flushAt/flushInterval follow PostHog's serverless guidance; captureImmediate makes them moot.
    client = new PostHog(postHogProjectToken, {
        host: POSTHOG_HOST,
        flushAt: 1,
        flushInterval: 0,
    })

    return client
}

type PostHogEvent = {
    distinctId: string
    event: string
    properties?: Record<string, unknown>
}

export async function capturePostHogEvent(event: PostHogEvent): Promise<void> {
    const posthog = await getPostHogClient()
    if (!posthog) return

    await posthog.captureImmediate(event)
}
