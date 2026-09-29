import { describe, expect, it, renderHook, vi } from '@/tests/unit.helpers'
import posthog from 'posthog-js'
import { usePostHogInit } from './use-posthog-init'

describe('usePostHogInit', () => {
    it('initializes PostHog with a host-only cookie', () => {
        const initSpy = vi.spyOn(posthog, 'init').mockImplementation(() => posthog)

        renderHook(() => usePostHogInit('phc_test'))

        expect(initSpy).toHaveBeenCalledOnce()
        expect(initSpy).toHaveBeenCalledWith(
            'phc_test',
            expect.objectContaining({
                api_host: 'https://us.i.posthog.com',
                defaults: '2026-05-30',
                cross_subdomain_cookie: false,
            }),
        )
    })
})
