import { describe, expect, it, renderHook, renderToServerHtml } from '@/tests/unit.helpers'
import { useIsHydrated } from './use-is-hydrated'

const Probe = () => <output>{String(useIsHydrated())}</output>

describe('useIsHydrated', () => {
    it('is true on a client mount', () => {
        expect(renderHook(useIsHydrated).result.current).toBe(true)
    })

    it('is false in the server render', () => {
        expect(renderToServerHtml(<Probe />)).toContain('<output>false</output>')
    })
})
