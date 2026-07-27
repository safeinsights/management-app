import { describe, expect, it, vi } from 'vitest'
import { TextInput } from '@mantine/core'
import { renderWithProviders, screen, userEvent } from '@/tests/unit.helpers'
import { FormField, fieldDescribedBy, widgetBlurHandler } from './form-field'

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
describe('widgetBlurHandler', () => {
    const WidgetProbe = ({ onLeave }: { onLeave: () => void }) => (
        <div onBlur={widgetBlurHandler(onLeave)} data-testid="widget">
            <button type="button">inside a</button>
            <button type="button">inside b</button>
        </div>
    )

    it('does not fire when focus moves between elements inside the widget', async () => {
        const user = userEvent.setup()
        const onLeave = vi.fn()
        renderWithProviders(
            <>
                <WidgetProbe onLeave={onLeave} />
                <button type="button">outside</button>
            </>,
        )

        await user.click(screen.getByRole('button', { name: 'inside a' }))
        await user.click(screen.getByRole('button', { name: 'inside b' }))

        expect(onLeave).not.toHaveBeenCalled()
    })

    it('fires when focus leaves the widget entirely', async () => {
        const user = userEvent.setup()
        const onLeave = vi.fn()
        renderWithProviders(
            <>
                <WidgetProbe onLeave={onLeave} />
                <button type="button">outside</button>
            </>,
        )

        await user.click(screen.getByRole('button', { name: 'inside a' }))
        await user.click(screen.getByRole('button', { name: 'outside' }))

        expect(onLeave).toHaveBeenCalledTimes(1)
    })

    it('does not fire when focus leaves the page entirely', () => {
        const onLeave = vi.fn()
        renderWithProviders(<WidgetProbe onLeave={onLeave} />)

        // relatedTarget is null when the user switches tab or window; that is not the user
        // moving to the next field, so it must not flag an incomplete value.
        const widget = screen.getByTestId('widget')
        widget.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }))

        expect(onLeave).not.toHaveBeenCalled()
    })
})
