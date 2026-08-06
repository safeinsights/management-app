import { getConfigValue } from './config'
import { PostHog } from 'posthog-node'

let client: PostHog | null = null

export async function getPostHogClient(): Promise<PostHog> {
    if (client) return client

    const postHogProjectToken = (await getConfigValue('POSTHOG_PROJECT_TOKEN', false)) ?? ''

    // flushAt and flushInterval are set per https://posthog.com/docs/libraries/node#short-lived-processes-like-serverless-environments ,
    // but they shouldn't matter if we consistently use captureImmediate
    client = new PostHog(postHogProjectToken, {
        host: 'https://us.i.posthog.com',
        flushAt: 1,
        flushInterval: 0,
    })

    return client
}
