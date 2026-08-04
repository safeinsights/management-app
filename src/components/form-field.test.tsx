import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TextInput } from '@mantine/core'
import { renderWithProviders, screen, userEvent } from '@/tests/unit.helpers'
import { FormField, fieldDescribedBy, widgetBlurHandler, __resetLastPointerDownForTests } from './form-field'

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
    // The last press is module state, so a click from a previous case would otherwise decide
    // the outcome of the next one.
    beforeEach(__resetLastPointerDownForTests)

    const WidgetProbe = ({ onLeave }: { onLeave: () => void }) => (
        <div onBlur={widgetBlurHandler(onLeave)} data-testid="widget">
            <button type="button">inside a</button>
            <button type="button">inside b</button>
        </div>
    )

    const press = (element: Element) => element.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    const leaveToNowhere = () =>
        screen.getByTestId('widget').dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }))

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

    // A null relatedTarget is ambiguous, and the two cases must be told apart: clicking
    // whitespace is the commonest way to leave a field, so treating it as "still inside"
    // silently defeats the whole feature.
    it('fires when focus goes to a non-focusable part of the page', () => {
        const onLeave = vi.fn()
        renderWithProviders(<WidgetProbe onLeave={onLeave} />)

        const widget = screen.getByTestId('widget')
        widget.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }))

        expect(onLeave).toHaveBeenCalledTimes(1)
    })

    it('does not fire when the document itself loses focus', () => {
        const onLeave = vi.fn()
        const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(false)
        renderWithProviders(<WidgetProbe onLeave={onLeave} />)

        // Switching tab or window also yields a null relatedTarget, but the user has not
        // moved to the next field, so it must not flag an incomplete value.
        const widget = screen.getByTestId('widget')
        widget.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }))

        expect(onLeave).not.toHaveBeenCalled()
        hasFocus.mockRestore()
    })

    // The third null-relatedTarget case, and the one that shipped broken: clicking the Lexical
    // toolbar re-renders the surface holding the caret, so focus lands on <body> with no
    // relatedTarget even though the user is still writing in the field.
    it('does not fire when a press inside the widget drops focus to the body', () => {
        const onLeave = vi.fn()
        renderWithProviders(<WidgetProbe onLeave={onLeave} />)

        press(screen.getByRole('button', { name: 'inside a' }))
        leaveToNowhere()

        expect(onLeave).not.toHaveBeenCalled()
    })

    it('fires when the press that preceded the blur was outside the widget', () => {
        const onLeave = vi.fn()
        renderWithProviders(
            <>
                <WidgetProbe onLeave={onLeave} />
                <p>neutral space</p>
            </>,
        )

        press(screen.getByText('neutral space'))
        leaveToNowhere()

        expect(onLeave).toHaveBeenCalledTimes(1)
    })

    // Escape blurs the editor by design. Without clearing the press on keydown, a stale in-widget
    // click would keep suppressing validation for the rest of the field's life.
    it('fires when a key is pressed after an in-widget press', () => {
        const onLeave = vi.fn()
        renderWithProviders(<WidgetProbe onLeave={onLeave} />)

        press(screen.getByRole('button', { name: 'inside a' }))
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        leaveToNowhere()

        expect(onLeave).toHaveBeenCalledTimes(1)
    })
})
