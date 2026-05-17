import { describe, expect, it, render } from '@/tests/unit.helpers'
import type { HocuspocusProvider } from '@hocuspocus/provider'

import {
    CodeReviewFeedbackProviderShare,
    useCodeReviewFeedbackProvider,
    usePublishCodeReviewFeedbackProvider,
} from './code-review-feedback-provider-context'

const Subscriber = ({ onProvider }: { onProvider: (p: HocuspocusProvider | null) => void }) => {
    const provider = useCodeReviewFeedbackProvider()
    onProvider(provider)
    return null
}

const Publisher = ({ value }: { value: HocuspocusProvider | null }) => {
    const publish = usePublishCodeReviewFeedbackProvider()
    publish(value)
    return null
}

describe('CodeReviewFeedbackProviderShare', () => {
    it('throws a clear error when consumed outside the share', () => {
        const orig = console.error
        console.error = () => {} // suppress React-rendered error noise
        try {
            expect(() => render(<Subscriber onProvider={() => {}} />)).toThrow(
                /CodeReviewFeedbackProviderShare missing/,
            )
        } finally {
            console.error = orig
        }
    })

    it('delivers the published provider to subscribers', () => {
        const fake = { id: 'fake' } as unknown as HocuspocusProvider
        let received: HocuspocusProvider | null = null

        render(
            <CodeReviewFeedbackProviderShare>
                <Publisher value={fake} />
                <Subscriber onProvider={(p) => (received = p)} />
            </CodeReviewFeedbackProviderShare>,
        )

        expect(received).toBe(fake)
    })

    it('delivers a null clear after a previous publish', () => {
        let received: HocuspocusProvider | null = null
        const fake = { id: 'fake' } as unknown as HocuspocusProvider

        const { rerender } = render(
            <CodeReviewFeedbackProviderShare>
                <Publisher value={fake} />
                <Subscriber onProvider={(p) => (received = p)} />
            </CodeReviewFeedbackProviderShare>,
        )

        expect(received).toBe(fake)

        rerender(
            <CodeReviewFeedbackProviderShare>
                <Publisher value={null} />
                <Subscriber onProvider={(p) => (received = p)} />
            </CodeReviewFeedbackProviderShare>,
        )

        expect(received).toBeNull()
    })
})
