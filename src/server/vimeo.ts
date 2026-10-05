import logger from '@/lib/logger'

const ONE_DAY_SECONDS = 60 * 60 * 24

export const formatVideoMinutes = (seconds: number) => Math.max(1, Math.round(seconds / 60))

// Best-effort: a Vimeo outage should hide the duration badge, not break the page.
export async function fetchVideoDurationMinutes(videoUrl: string): Promise<number | null> {
    try {
        const response = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(videoUrl)}`, {
            next: { revalidate: ONE_DAY_SECONDS },
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
        logger.warn(`Vimeo oEmbed lookup failed for ${videoUrl}: ${err}`)
        return null
    }
}
