import { renderWithProviders, screen, describe, it, expect } from '@/tests/unit.helpers'
import { SingleUserEditor } from './single-user-editor'

// Driven through SingleUserEditor because the surface only works inside a LexicalComposer.
const surface = () => document.querySelector('.collaborative-editor-container') as HTMLElement
const editable = () => screen.getByRole('textbox')

describe('EditorSurface', () => {
    it('renders a resize handle when the caller opts in', () => {
        renderWithProviders(<SingleUserEditor id="doc-resizable" ariaLabel="Impact" isResizable />)

        expect(surface().style.resize).toBe('vertical')
    })

    it('renders no resize handle unless the caller opts in', () => {
        renderWithProviders(<SingleUserEditor id="doc-default-resize" ariaLabel="Impact" />)

        // 'none' rather than absent: the handle has to be unusable, not merely unstyled.
        expect(surface().style.resize).toBe('none')
    })

    it('removes the resize handle when the field is not resizable', () => {
        renderWithProviders(<SingleUserEditor id="doc-locked" ariaLabel="Impact" isResizable={false} />)

        expect(surface().style.resize).toBe('none')
    })

    it('applies the requested content height to the editable surface', () => {
        renderWithProviders(<SingleUserEditor id="doc-height" ariaLabel="Project summary" contentHeight={505} />)

        expect(editable().style.minHeight).toBe('505px')
    })

    it('falls back to the default content height', () => {
        renderWithProviders(<SingleUserEditor id="doc-default-height" ariaLabel="Impact" />)

        expect(editable().style.minHeight).toBe('200px')
    })

    it('keeps a caller-supplied minHeight when no content height is given', () => {
        renderWithProviders(
            <SingleUserEditor id="doc-style-height" ariaLabel="Feedback" contentStyle={{ minHeight: 600 }} />,
        )

        expect(editable().style.minHeight).toBe('600px')
    })

    it('prefers an explicit content height over a caller-supplied minHeight', () => {
        renderWithProviders(
            <SingleUserEditor
                id="doc-both-heights"
                ariaLabel="Feedback"
                contentStyle={{ minHeight: 600 }}
                contentHeight={105}
            />,
        )

        expect(editable().style.minHeight).toBe('105px')
    })

    it('makes the editable surface focusable', () => {
        renderWithProviders(<SingleUserEditor id="doc-focus" ariaLabel="Research questions" />)

        expect(editable().tabIndex).toBe(0)

        editable().focus()
        expect(document.activeElement).toBe(editable())
    })

    it('marks the surface invalid and reddens the border when the field has an error', () => {
        renderWithProviders(<SingleUserEditor id="doc-error" ariaLabel="Impact" error="Required" />)

        expect(editable()).toHaveAttribute('aria-invalid', 'true')
        expect(surface().style.borderColor).toBe('var(--mantine-color-error)')
    })

    it('renders no placeholder when the caller passes none', () => {
        renderWithProviders(<SingleUserEditor id="doc-no-placeholder" ariaLabel="Impact" />)

        expect(screen.queryByText(/^Ex\./)).not.toBeInTheDocument()
    })

    it('renders the placeholder when the caller passes one', () => {
        renderWithProviders(<SingleUserEditor id="doc-placeholder" ariaLabel="Impact" placeholder="Ex. something" />)

        expect(screen.getByText('Ex. something')).toBeInTheDocument()
    })
})
