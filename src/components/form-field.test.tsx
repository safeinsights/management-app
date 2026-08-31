import { describe, expect, it, vi } from 'vitest'
import { TextInput } from '@mantine/core'
import { renderWithProviders, screen, userEvent } from '@/tests/unit.helpers'
import { FormField, fieldDescribedBy, useWidgetBlur } from './form-field'

describe('FormField', () => {
    it('renders the label, description and error, and pairs them to the control', () => {
        renderWithProviders(
            <FormField inputId="field" label="Study title" required description="Helper text" error="This is required.">
                <TextInput id="field" aria-label="Study title input" />
            </FormField>,
        )

        expect(screen.getByText('Study title')).toBeInTheDocument()
        expect(screen.getByText('Helper text')).toBeInTheDocument()
        expect(screen.getByText('This is required.')).toBeInTheDocument()
        expect(screen.getByText('This is required.').closest('[id]')).toHaveAttribute('id', 'field-error')
    })

    it('renders no error node when there is no error', () => {
        renderWithProviders(
            <FormField inputId="field" label="Study title">
                <TextInput id="field" aria-label="Study title input" />
            </FormField>,
        )

        expect(document.getElementById('field-error')).toBeNull()
    })

    it('renders the footer slot alongside the error', () => {
        renderWithProviders(
            <FormField inputId="field" label="Study title" error="Too long." footer={<span>12/20</span>}>
                <TextInput id="field" aria-label="Study title input" />
            </FormField>,
        )

        expect(screen.getByText('Too long.')).toBeInTheDocument()
        expect(screen.getByText('12/20')).toBeInTheDocument()
    })
})

describe('fieldDescribedBy', () => {
    it('lists only the ids that exist', () => {
        expect(fieldDescribedBy('f', { hasError: true, hasDescription: true })).toBe('f-error f-description')
        expect(fieldDescribedBy('f', { hasError: true, hasDescription: false })).toBe('f-error')
        expect(fieldDescribedBy('f', { hasError: false, hasDescription: false })).toBeUndefined()
    })
})

// The guard is what keeps composite widgets (editor + toolbar, pills + remove buttons, radio
// groups) from erroring while the user is still moving around inside them.
describe('useWidgetBlur', () => {
    const WidgetProbe = ({ onLeave }: { onLeave: () => void }) => {
        const widgetBlur = useWidgetBlur<HTMLDivElement>(onLeave)
        return (
            <>
                <div {...widgetBlur} data-testid="widget">
                    <button type="button">inside a</button>
                    <button type="button">inside b</button>
                </div>
                <p>neutral space</p>
                <button type="button">outside</button>
            </>
        )
    }

    const dropFocusToBody = () =>
        screen.getByTestId('widget').dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }))

    it('does not fire when focus moves between elements inside the widget', async () => {
        const user = userEvent.setup()
        const onLeave = vi.fn()
        renderWithProviders(<WidgetProbe onLeave={onLeave} />)

        await user.click(screen.getByRole('button', { name: 'inside a' }))
        await user.click(screen.getByRole('button', { name: 'inside b' }))

        expect(onLeave).not.toHaveBeenCalled()
    })

    it('fires when the user clicks a control outside the widget', async () => {
        const user = userEvent.setup()
        const onLeave = vi.fn()
        renderWithProviders(<WidgetProbe onLeave={onLeave} />)

        await user.click(screen.getByRole('button', { name: 'inside a' }))
        await user.click(screen.getByRole('button', { name: 'outside' }))

        // The press and the focus change are two separate signals; only one leave may result.
        expect(onLeave).toHaveBeenCalledTimes(1)
    })

    // Clicking whitespace is the commonest way to leave a field, so missing it silently defeats
    // the whole feature. It reaches focusout with a null relatedTarget, which says nothing, so
    // the press is what has to decide.
    it('fires when the user clicks a non-focusable part of the page', async () => {
        const user = userEvent.setup()
        const onLeave = vi.fn()
        renderWithProviders(<WidgetProbe onLeave={onLeave} />)

        await user.click(screen.getByRole('button', { name: 'inside a' }))
        await user.click(screen.getByText('neutral space'))

        expect(onLeave).toHaveBeenCalledTimes(1)
    })

    it('fires when the user tabs out of the widget', async () => {
        const user = userEvent.setup()
        const onLeave = vi.fn()
        renderWithProviders(<WidgetProbe onLeave={onLeave} />)

        await user.click(screen.getByRole('button', { name: 'inside b' }))
        await user.tab()

        expect(screen.getByRole('button', { name: 'outside' })).toHaveFocus()
        expect(onLeave).toHaveBeenCalledTimes(1)
    })

    // The case that shipped broken: clicking the Lexical toolbar re-renders the surface holding
    // the caret, so focus lands on <body> with no relatedTarget even though the user is still
    // writing. Switching tab or window looks identical on the focus event, which is why neither
    // is read off it.
    it('does not fire when the widget drops focus to the body with no press outside it', async () => {
        const user = userEvent.setup()
        const onLeave = vi.fn()
        renderWithProviders(<WidgetProbe onLeave={onLeave} />)

        await user.click(screen.getByRole('button', { name: 'inside a' }))
        dropFocusToBody()

        expect(onLeave).not.toHaveBeenCalled()
    })

    // Without this an outside press would validate every widget on the page at once, so the
    // first click anywhere would flag fields the user has not reached yet.
    it('does not fire for a widget the user has never entered', async () => {
        const user = userEvent.setup()
        const onLeave = vi.fn()
        renderWithProviders(<WidgetProbe onLeave={onLeave} />)

        await user.click(screen.getByRole('button', { name: 'outside' }))

        expect(onLeave).not.toHaveBeenCalled()
    })
})
