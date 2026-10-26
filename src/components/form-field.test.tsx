import { describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { TextInput } from '@mantine/core'
import { renderWithProviders, screen, userEvent } from '@/tests/unit.helpers'
import { FormField, fieldDescribedBy, fieldTestId, useWidgetBlur } from './form-field'

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

    // OTTER-880: a bare Mantine error renders at 12px with no icon, unlike the design.
    it('renders the error with the error icon', () => {
        renderWithProviders(
            <FormField inputId="field" label="Study title" error="This is required.">
                <TextInput id="field" aria-label="Study title input" />
            </FormField>,
        )

        expect(document.getElementById('field-error')?.querySelector('svg')).toBeInTheDocument()
    })

    it('separates the label from the description', () => {
        renderWithProviders(
            <FormField inputId="field" label="Study title" description="Helper text">
                <TextInput id="field" aria-label="Study title input" />
            </FormField>,
        )

        expect(screen.getByText('Study title')).toHaveStyle({ marginBottom: '4px' })
    })

    // OTTER-769: theme styles reach the DOM as an inline style, so this covers every
    // Mantine-rendered asterisk in the app, not only this component's.
    it('paints the required asterisk with the design color', () => {
        renderWithProviders(
            <FormField inputId="field" label="Study title" required>
                <TextInput id="field" aria-label="Study title input" />
            </FormField>,
        )

        const asterisk = screen.getByText('Study title').querySelector('span')

        expect(asterisk).toHaveTextContent('*')
        expect(asterisk).toHaveStyle({ color: '#7e241e' })
    })

    // OTTER-880: set in the theme, so it also covers inputs that render their own error.
    it('sizes Mantine input errors at 14px', () => {
        renderWithProviders(<TextInput label="Study title" error="This is required." />)

        expect(screen.getByText('This is required.').style.getPropertyValue('--input-error-size')).toBe(
            'var(--mantine-font-size-sm)',
        )
    })

    it('renders no error node when there is no error', () => {
        renderWithProviders(
            <FormField inputId="field" label="Study title">
                <TextInput id="field" aria-label="Study title input" />
            </FormField>,
        )

        expect(document.getElementById('field-error')).toBeNull()
    })

    // A row that mounts with its error pushes whatever is below it down, under a pending click.
    it('reserves the error row before a blur error arrives', async () => {
        const Harness = () => {
            const [error, setError] = useState<string>()
            return (
                <>
                    <FormField inputId="field" label="Study title" error={error} validatesOnBlur>
                        <TextInput id="field" aria-label="Study title input" />
                    </FormField>
                    <button onClick={() => setError('This is required.')}>Raise error</button>
                </>
            )
        }
        renderWithProviders(<Harness />)
        const row = screen.getByTestId(fieldTestId('field')).lastElementChild as HTMLElement

        expect(row.style.minHeight).toBe('calc(var(--mantine-font-size-sm) * var(--mantine-line-height-sm))')

        await userEvent.click(screen.getByRole('button', { name: 'Raise error' }))

        expect(screen.getByTestId(fieldTestId('field')).lastElementChild).toBe(row)
        expect(row).toHaveTextContent('This is required.')
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

        expect(onLeave).toHaveBeenCalledTimes(1)
    })

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

    // Clicking the Lexical toolbar re-renders the surface holding the caret, so focus lands on
    // <body> with no relatedTarget even though the user is still writing.
    it('does not fire when the widget drops focus to the body with no press outside it', async () => {
        const user = userEvent.setup()
        const onLeave = vi.fn()
        renderWithProviders(<WidgetProbe onLeave={onLeave} />)

        await user.click(screen.getByRole('button', { name: 'inside a' }))
        dropFocusToBody()

        expect(onLeave).not.toHaveBeenCalled()
    })

    it('does not fire for a widget the user has never entered', async () => {
        const user = userEvent.setup()
        const onLeave = vi.fn()
        renderWithProviders(<WidgetProbe onLeave={onLeave} />)

        await user.click(screen.getByRole('button', { name: 'outside' }))

        expect(onLeave).not.toHaveBeenCalled()
    })
})
