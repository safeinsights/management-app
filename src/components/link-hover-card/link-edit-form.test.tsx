import { renderWithProviders, screen, userEvent, describe, it, expect, vi } from '@/tests/unit.helpers'
import { LinkEditForm } from './link-edit-form'
import { INVALID_URL_MESSAGE } from './copy'

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
        expect(await screen.findByText(INVALID_URL_MESSAGE)).toBeInTheDocument()
        expect(form.url).toHaveAttribute('aria-invalid', 'true')

        const describedBy = form.url.getAttribute('aria-describedby')
        expect(describedBy).toBeTruthy()
        const described = describedBy!
            .split(' ')
            .map((id) => document.getElementById(id)?.textContent ?? '')
            .join(' ')
        expect(described).toContain(INVALID_URL_MESSAGE)
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

    // An empty text field is not an error state; the caller leaves the existing link text alone.
    it('reports an empty text field rather than blocking the save', async () => {
        const user = userEvent.setup()
        const form = renderForm()

        await user.clear(form.text)
        await user.click(form.save)

        expect(form.onSave).toHaveBeenCalledWith({ text: '', url: 'https://example.com/prior' })
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
