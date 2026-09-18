import { describe, expect, it, renderWithProviders, screen } from '@/tests/unit.helpers'
import { act } from 'react'
import { useTextareaResizeFloor } from './use-textarea-resize-floor'

// jsdom does not lay out, so scrollHeight is always 0 and a real pixel floor cannot be produced
// here. These tests stub scrollHeight to drive the hook's arithmetic, and assert the mechanism:
// that the floor follows the content, releases again, and respects the cap. The pixel values come
// from the browser instead (OTTER-787).
function stubContentHeight(el: HTMLTextAreaElement, px: number) {
    Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => px })
}

function Harness({ maxRows }: { maxRows?: number }) {
    const { ref, floor } = useTextareaResizeFloor({ maxRows })
    return (
        <>
            <textarea ref={ref} rows={3} aria-label="Note" style={{ minHeight: floor }} />
            <output data-testid="floor">{floor ?? 'none'}</output>
        </>
    )
}

const field = () => screen.getByLabelText('Note') as HTMLTextAreaElement
const reportedFloor = () => screen.getByTestId('floor').textContent

const typeInto = (el: HTMLTextAreaElement, contentHeight: number) => {
    stubContentHeight(el, contentHeight)
    act(() => {
        el.dispatchEvent(new Event('input', { bubbles: true }))
    })
}

describe('useTextareaResizeFloor', () => {
    it('sets a floor from the content on mount', () => {
        renderWithProviders(<Harness />)
        expect(reportedFloor()).not.toBe('none')
    })

    it('raises the floor as the content grows', () => {
        renderWithProviders(<Harness />)
        typeInto(field(), 300)
        expect(Number(reportedFloor())).toBe(300)
    })

    // The regression this hook exists to avoid: measuring without clearing the previous minHeight
    // leaves the field able to grow and never shrink, because scrollHeight never reports below
    // clientHeight. Verified in a browser at 74px -> 254px -> 254px before the fix.
    it('lowers the floor again when the content is deleted', () => {
        renderWithProviders(<Harness />)
        const el = field()

        typeInto(el, 300)
        expect(Number(reportedFloor())).toBe(300)

        typeInto(el, 74)
        expect(Number(reportedFloor())).toBe(74)
    })

    it('caps the floor at maxRows once the content passes it', () => {
        renderWithProviders(<Harness maxRows={2} />)
        const el = field()
        el.style.lineHeight = '20px'

        typeInto(el, 1000)
        expect(Number(reportedFloor())).toBeLessThan(1000)
    })

    it('leaves growth uncapped when the line height is not numeric', () => {
        renderWithProviders(<Harness maxRows={2} />)
        const el = field()
        el.style.lineHeight = 'normal'

        typeInto(el, 640)
        // A zero fallback for the unparseable line height would collapse the floor to the padding.
        expect(Number(reportedFloor())).toBe(640)
    })

    it('writes no max-height, so a drag may still go past the cap', () => {
        renderWithProviders(<Harness maxRows={2} />)
        typeInto(field(), 1000)
        expect(field().style.maxHeight).toBe('')
    })
})
