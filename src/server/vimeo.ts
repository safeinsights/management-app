import logger from '@/lib/logger'

const ONE_DAY_SECONDS = 60 * 60 * 24
// The lookup sits on the Submit code page's critical path and a failed fetch isn't cached, so a hung
// Vimeo would otherwise stall every load. The badge is optional; give up quickly.
const VIMEO_FETCH_TIMEOUT_MS = 2_000

export const formatVideoMinutes = (seconds: number) => Math.max(1, Math.round(seconds / 60))

// Best-effort: a Vimeo outage should hide the duration badge, not break the page.
export async function fetchVideoDurationMinutes(videoUrl: string): Promise<number | null> {
    try {
        const response = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(videoUrl)}`, {
            next: { revalidate: ONE_DAY_SECONDS },
            signal: AbortSignal.timeout(VIMEO_FETCH_TIMEOUT_MS),
        })
        if (!response.ok) {
            logger.warn(`Vimeo oEmbed returned ${response.status} for ${videoUrl}`)
            return null
        }

        const { duration } = (await response.json()) as { duration?: unknown }
        if (typeof duration !== 'number') {
            logger.warn(`Vimeo oEmbed had no duration for ${videoUrl}`)
            return null
        }

        return formatVideoMinutes(duration)
    } catch (err) {
        const timedOut = err instanceof Error && err.name === 'TimeoutError'
        logger.warn(
            `Vimeo oEmbed lookup for ${videoUrl} ${timedOut ? `timed out after ${VIMEO_FETCH_TIMEOUT_MS}ms` : `failed: ${err}`}`,
        )
        return null
    }
}
