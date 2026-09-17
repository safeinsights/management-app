import {
    createTestQueryWrapper,
    describe,
    expect,
    it,
    mockSessionWithTestData,
    renderHook,
    waitFor,
} from '@/tests/unit.helpers'
import { useLinkPreview } from './use-link-preview'

const renderPreview = (href: string) => renderHook(() => useLinkPreview(href), { wrapper: createTestQueryWrapper() })

describe('useLinkPreview', () => {
    it('answers an off-site link without asking the server', () => {
        const href = 'https://example.com/paper'

        const { result } = renderPreview(href)

        expect(result.current).toEqual({ kind: 'external', href })
    })

    // "Unable to open link" states something about the reader's access, which a failed request
    // does not. A path over the action's length limit fails the request for real.
    it('falls back to the URL when the request fails rather than claiming no access', async () => {
        await mockSessionWithTestData({ orgType: 'lab' })
        const href = `${window.location.origin}/${'a'.repeat(3000)}`

        const { result } = renderPreview(href)

        await waitFor(() => expect(result.current).toEqual({ kind: 'external', href }))
    })

    it('still reports a page the server refuses as unavailable', async () => {
        await mockSessionWithTestData({ orgType: 'lab' })
        const href = `${window.location.origin}/admin/safeinsights`

        const { result } = renderPreview(href)

        await waitFor(() => expect(result.current).toEqual({ kind: 'unavailable', href }))
    })

    it('names a page the reader can open', async () => {
        const { org } = await mockSessionWithTestData({ orgType: 'lab' })
        const href = `${window.location.origin}/${org.slug}/dashboard`

        const { result } = renderPreview(href)

        await waitFor(() => expect(result.current).toMatchObject({ kind: 'internal', title: 'Dashboard' }))
    })
})
