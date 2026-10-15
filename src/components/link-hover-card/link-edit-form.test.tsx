import { renderWithProviders, screen, userEvent, describe, it, expect, vi } from '@/tests/unit.helpers'
import { LinkEditForm } from './link-edit-form'
import { EMPTY_TEXT_MESSAGE, INVALID_URL_MESSAGE } from './copy'

function renderForm(onSave = vi.fn(), onCancel = vi.fn()) {
    renderWithProviders(
        <LinkEditForm
            initialText="prior study writeup"
            initialUrl="https://example.com/prior"
            onSave={onSave}
            onCancel={onCancel}
        />,
    )

    return {
        onSave,
        onCancel,
        text: screen.getByLabelText('Text'),
        url: screen.getByLabelText('Link'),
        save: screen.getByRole('button', { name: 'Save' }),
        cancel: screen.getByRole('button', { name: 'Cancel' }),
    }
}

// The error the field announces, found only when it carries the design's icon.
function describedError(input: HTMLElement) {
    const ids = input.getAttribute('aria-describedby')?.split(' ') ?? []
    return ids.map((id) => document.getElementById(id)).find((el) => el?.querySelector('svg'))
}

describe('LinkEditForm', () => {
    it('prefills the hyperlinked text and the URL', () => {
        const form = renderForm()

        expect(form.text).toHaveValue('prior study writeup')
        expect(form.url).toHaveValue('https://example.com/prior')
    })

    it('saves the edited text and URL', async () => {
        const user = userEvent.setup()
        const form = renderForm()

        await user.clear(form.text)
        await user.type(form.text, 'newer writeup')
        await user.clear(form.url)
        await user.type(form.url, 'https://example.com/newer')
        await user.click(form.save)

        expect(form.onSave).toHaveBeenCalledWith({ text: 'newer writeup', url: 'https://example.com/newer' })
    })

    it('rejects an invalid URL on save and describes the error to the field', async () => {
        const user = userEvent.setup()
        const form = renderForm()

        await user.clear(form.url)
        await user.type(form.url, 'not a url')
        await user.click(form.save)

        expect(form.onSave).not.toHaveBeenCalled()
        await screen.findByText(INVALID_URL_MESSAGE)
        expect(form.url).toHaveAttribute('aria-invalid', 'true')
        expect(describedError(form.url)).toHaveTextContent(INVALID_URL_MESSAGE)
    })

    it('clears the error once the URL changes', async () => {
        const user = userEvent.setup()
        const form = renderForm()

        await user.clear(form.url)
        await user.click(form.save)
        expect(await screen.findByText(INVALID_URL_MESSAGE)).toBeInTheDocument()

        await user.type(form.url, 'h')

        expect(screen.queryByText(INVALID_URL_MESSAGE)).toBeNull()
    })

    // Saving empty text used to pass and then silently keep the old text.
    it('refuses to save an empty text field', async () => {
        const user = userEvent.setup()
        const form = renderForm()

        await user.clear(form.text)
        await user.click(form.save)

        expect(form.onSave).not.toHaveBeenCalled()
        await screen.findByText(EMPTY_TEXT_MESSAGE)
        expect(form.text).toHaveAttribute('aria-invalid', 'true')
        expect(describedError(form.text)).toHaveTextContent(EMPTY_TEXT_MESSAGE)
    })

    it('trims what it saves, and refuses text that is only spaces', async () => {
        const user = userEvent.setup()
        const form = renderForm()

        await user.clear(form.text)
        await user.type(form.text, '   ')
        await user.click(form.save)
        expect(form.onSave).not.toHaveBeenCalled()

        await user.clear(form.text)
        await user.type(form.text, '  newer writeup  ')
        await user.click(form.save)

        expect(form.onSave).toHaveBeenCalledWith({ text: 'newer writeup', url: 'https://example.com/prior' })
    })

    it('submits on Enter and cancels on the Cancel button', async () => {
        const user = userEvent.setup()
        const form = renderForm()

        await user.click(form.url)
        await user.keyboard('{Enter}')
        expect(form.onSave).toHaveBeenCalledOnce()

        await user.click(form.cancel)
        expect(form.onCancel).toHaveBeenCalledOnce()
    })
})
