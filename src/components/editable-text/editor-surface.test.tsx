import { renderWithProviders, screen, describe, it, expect } from '@/tests/unit.helpers'
import { SingleUserEditor } from './single-user-editor'

// Driven through SingleUserEditor rather than EditorSurface directly: the surface only works
// inside a LexicalComposer, and going through a real editor is what the project's testing
// guidance asks for anyway.
const surface = () => document.querySelector('.collaborative-editor-container') as HTMLElement
const editable = () => screen.getByRole('textbox')

describe('EditorSurface', () => {
    it('renders a resize handle by default', () => {
        renderWithProviders(<SingleUserEditor id="doc-resizable" ariaLabel="Impact" />)

        expect(surface().style.resize).toBe('vertical')
    })

    it('removes the resize handle when the field is not resizable', () => {
        renderWithProviders(<SingleUserEditor id="doc-locked" ariaLabel="Impact" isResizable={false} />)

        // 'none' rather than absent: the handle has to be unusable, not merely unstyled.
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

    // Without this the editable surface is unfocusable in the test environment, so
    // `focusFirstInvalid` would silently no-op and the "jump to the first flagged field" rule
    // would look covered while never being exercised.
    it('makes the editable surface focusable', () => {
        renderWithProviders(<SingleUserEditor id="doc-focus" ariaLabel="Research questions" />)

        expect(editable().tabIndex).toBe(0)

        editable().focus()
        expect(document.activeElement).toBe(editable())
    })

    it('marks the surface invalid and reddens the border when the field has an error', () => {
        renderWithProviders(<SingleUserEditor id="doc-error" ariaLabel="Impact" error="Required" />)

        expect(editable()).toHaveAttribute('aria-invalid', 'true')
        expect(surface().style.borderColor).toBe('var(--mantine-color-red-filled)')
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
