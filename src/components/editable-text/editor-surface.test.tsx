import { rem } from '@mantine/core'
import { renderWithProviders, screen, describe, it, expect, waitFor, fireEvent } from '@/tests/unit.helpers'
import { SingleUserEditor } from './single-user-editor'

// Driven through SingleUserEditor because the surface only works inside a LexicalComposer.
const surface = () => document.querySelector('.collaborative-editor-container') as HTMLElement
const editable = () => screen.getByRole('textbox')

describe('EditorSurface', () => {
    it('renders a resize handle when the caller opts in', () => {
        renderWithProviders(<SingleUserEditor id="doc-resizable" ariaLabel="Impact" isResizable />)

        expect(surface()).toHaveAttribute('data-resizable')
    })

    it('renders no resize handle unless the caller opts in', () => {
        renderWithProviders(<SingleUserEditor id="doc-default-resize" ariaLabel="Impact" />)

        expect(surface()).not.toHaveAttribute('data-resizable')
    })

    it('removes the resize handle when the field is not resizable', () => {
        renderWithProviders(<SingleUserEditor id="doc-locked" ariaLabel="Impact" isResizable={false} />)

        expect(surface()).not.toHaveAttribute('data-resizable')
    })

    it('keeps the measured height floor in pixels', async () => {
        renderWithProviders(<SingleUserEditor id="doc-floor" ariaLabel="Impact" isResizable />)

        await waitFor(() => expect(surface().style.minHeight).toMatch(/^calc\(\d+(\.\d+)?px\)$/))
    })

    it('applies the requested content height to the editable surface', () => {
        renderWithProviders(<SingleUserEditor id="doc-height" ariaLabel="Project summary" contentHeight={505} />)

        expect(editable().style.minHeight).toBe(rem(505))
    })

    it('falls back to the default content height', () => {
        renderWithProviders(<SingleUserEditor id="doc-default-height" ariaLabel="Impact" />)

        expect(editable().style.minHeight).toBe(rem(200))
    })

    it('applies the requested text size to the editable surface', () => {
        renderWithProviders(<SingleUserEditor id="doc-fz" ariaLabel="Feedback" fz="sm" />)

        expect(editable().style.fontSize).toBe('var(--mantine-font-size-sm)')
    })

    it('makes the editable surface focusable', () => {
        renderWithProviders(<SingleUserEditor id="doc-focus" ariaLabel="Research questions" />)

        expect(editable().tabIndex).toBe(0)

        editable().focus()
        expect(document.activeElement).toBe(editable())
    })

    it('focuses the editor when the toolbar row is pressed beside the toolbar', () => {
        renderWithProviders(<SingleUserEditor id="doc-toolbar-row" ariaLabel="Impact" />)

        const toolbarRow = screen.getByRole('button', { name: 'Bold' }).closest('.mantine-Paper-root')!.parentElement!
        fireEvent.mouseDown(toolbarRow)

        expect(document.activeElement).toBe(editable())
    })

    it('marks the surface invalid and reddens the border when the field has an error', () => {
        renderWithProviders(<SingleUserEditor id="doc-error" ariaLabel="Impact" error="Required" />)

        expect(editable()).toHaveAttribute('aria-invalid', 'true')
        expect(surface()).toHaveAttribute('data-error')
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
