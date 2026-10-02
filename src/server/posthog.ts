import { ENVIRONMENT_ID, getConfigValue } from './config'
import { PostHog } from 'posthog-node'
import * as Sentry from '@sentry/nextjs'
import { POSTHOG_HOST } from '@/lib/constants'
import logger from '@/lib/logger'

async function createPostHogClient(): Promise<PostHog | null> {
    const postHogProjectToken = await getConfigValue('POSTHOG_PROJECT_TOKEN', false)
    if (!postHogProjectToken) return null

    // flushAt/flushInterval follow PostHog's serverless guidance; captureImmediate makes them moot.
    // Tight timeout and one quick retry: captures run before emails, and the defaults can stall ~50s.
    return new PostHog(postHogProjectToken, {
        host: POSTHOG_HOST,
        flushAt: 1,
        flushInterval: 0,
        requestTimeout: 3_000,
        fetchRetryCount: 1,
        fetchRetryDelay: 500,
    })
}

let client: Promise<PostHog | null> | undefined

// Shared so concurrent first captures build one client; a null is retried, so a failed lookup
// does not switch analytics off for the instance's lifetime.
const getPostHogClient = () => {
    client ??= createPostHogClient().then((created) => {
        if (!created) client = undefined
        return created
    })
    return client
}

export type PostHogEventName =
    | 'study_created'
    | 'study_proposal_submitted'
    | 'study_proposal_approved'
    | 'study_proposal_declined'
    | 'study_proposal_clarification_requested'
    | 'study_code_submitted'
    | 'study_code_approved'
    | 'study_code_clarification_requested'
    | 'study_results_outputs_shared'
    | 'study_results_outputs_not_shared'
    | 'user_logged_in'
    | 'invited'
    | 'accepted_invite'
    | 'role_updated'

type PostHogProperties = Record<string, unknown>

type PostHogEvent = {
    distinctId: string
    event: PostHogEventName
    // A function defers its lookups until PostHog is known to be on, and folds their failures in.
    properties?: PostHogProperties | (() => Promise<PostHogProperties>)
}

// Never throws: callers capture next to emails and audit rows, and analytics must not block either.
export async function capturePostHogEvent({ properties, ...event }: PostHogEvent): Promise<void> {
    try {
        const posthog = await getPostHogClient()
        if (!posthog) return

        const resolved = typeof properties === 'function' ? await properties() : properties

        // captureImmediate reports a failed send through this event instead of rejecting.
        let failure: unknown
        const stopListening = posthog.on('error', (error: unknown) => {
            failure ??= error
        })
        try {
            await posthog.captureImmediate({ ...event, properties: { ...resolved, environment: ENVIRONMENT_ID } })
        } finally {
            stopListening()
        }
        if (failure) throw failure
    } catch (error: unknown) {
        logger.error(error)
        Sentry.captureException(error)
        await Sentry.flush(2_000)
    }
}
