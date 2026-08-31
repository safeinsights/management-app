import { renderWithProviders, screen, describe, it, expect } from '@/tests/unit.helpers'
import { SingleUserEditor } from './single-user-editor'

// Driven through SingleUserEditor rather than EditorSurface directly: the surface only works
// inside a LexicalComposer, and going through a real editor is what the project's testing
// guidance asks for anyway.
const surface = () => document.querySelector('.collaborative-editor-container') as HTMLElement
const editable = () => screen.getByRole('textbox')

describe('EditorSurface', () => {
    it('renders a resize handle when the caller opts in', () => {
        renderWithProviders(<SingleUserEditor id="doc-resizable" ariaLabel="Impact" isResizable />)

        expect(surface().style.resize).toBe('vertical')
    })

    // The surface is shared with the reviewer-feedback, code-review and outputs-decision editors,
    // which never had a handle. Opting in is what keeps OTTER-691's handle on Step 2 only.
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

    // Callers that predate `contentHeight` size themselves through contentStyle. Letting the
    // default overwrite that silently resized every such editor in the app.
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
        expect(surface().style.borderColor).toBe('var(--mantine-color-red-10)')
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
