import { describe, expect, it, render } from '@/tests/unit.helpers'
import { HydrationMarker } from './hydration-marker'

describe('HydrationMarker', () => {
    // This is the only writer of the flag every e2e goto() waits on, so an effect that stops
    // firing would time out every spec rather than fail one.
    it('sets the readiness flag once it has mounted', () => {
        window.isReactHydrated = undefined

        const { container } = render(<HydrationMarker />)

        expect(window.isReactHydrated).toBe(true)
        expect(container).toBeEmptyDOMElement()
    })
})
