import { describe, expect, it, waitFor } from '@/tests/unit.helpers'
import { titleShadowIframe } from './onboarding-video'

const TITLE = 'SafeInsights IDE Orientation'

const shadowHost = () => {
    const host = document.createElement('div')
    host.attachShadow({ mode: 'open' })
    document.body.appendChild(host)
    return host
}

describe('titleShadowIframe', () => {
    // vimeo-video-element writes its iframe after the ref attaches, and rewrites it on later loads.
    it('titles an iframe written into the shadow root later, and again when it is replaced', async () => {
        const host = shadowHost()
        titleShadowIframe(host)

        host.shadowRoot!.innerHTML = '<style></style><iframe></iframe>'
        await waitFor(() => expect(host.shadowRoot!.querySelector('iframe')).toHaveAttribute('title', TITLE))

        host.shadowRoot!.innerHTML = '<style></style><iframe></iframe>'
        await waitFor(() => expect(host.shadowRoot!.querySelector('iframe')).toHaveAttribute('title', TITLE))
    })

    it('titles an iframe that is already there', () => {
        const host = shadowHost()
        host.shadowRoot!.innerHTML = '<iframe></iframe>'

        titleShadowIframe(host)

        expect(host.shadowRoot!.querySelector('iframe')).toHaveAttribute('title', TITLE)
    })
})
