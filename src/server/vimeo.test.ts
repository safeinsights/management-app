import { describe, expect, it, vi } from '@/tests/unit.helpers'
import { fetchVideoDurationMinutes, formatVideoMinutes } from './vimeo'

const VIDEO_URL = 'https://vimeo.com/1/abc'

describe('formatVideoMinutes', () => {
    it.each([
        [926, 15],
        [90, 2],
        [89, 1],
        [30, 1],
        [0, 1],
    ])('rounds %i seconds to %i min', (seconds, minutes) => {
        expect(formatVideoMinutes(seconds)).toBe(minutes)
    })
})

describe('fetchVideoDurationMinutes', () => {
    it('asks oEmbed about the given video and returns whole minutes', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ duration: 926 }))

        expect(await fetchVideoDurationMinutes(VIDEO_URL)).toBe(15)
        expect(String(fetchSpy.mock.calls[0][0])).toBe(
            `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(VIDEO_URL)}`,
        )
    })

    it.each([
        ['an error status', () => Promise.resolve(new Response('nope', { status: 404 }))],
        ['no duration', () => Promise.resolve(Response.json({ title: 'x' }))],
        ['a network failure', () => Promise.reject(new Error('offline'))],
    ])('returns null on %s', async (_label, respond) => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(respond)

        expect(await fetchVideoDurationMinutes(VIDEO_URL)).toBeNull()
    })
})
