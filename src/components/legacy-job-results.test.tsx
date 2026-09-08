import { describe, it, expect, vi } from 'vitest'
import { screen, userEvent, waitFor, renderWithProviders } from '@/tests/unit.helpers'
import { ViewFile } from './legacy-job-results'
import { JobFile } from '@/lib/types'

const XSS_PAYLOAD = '<img src=x onerror="window.__pwned = true">'

const encode = (text: string): ArrayBuffer => {
    const bytes = new TextEncoder().encode(text)
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

const jobFile = (path: string, contents: string): JobFile => ({
    path,
    fileType: 'APPROVED-RESULT',
    contents: encode(contents),
})

const clickView = async () => {
    await userEvent.click(screen.getByRole('button', { name: /view/i }))
}

describe('LegacyJobResults ViewFile', () => {
    // Legacy results were written via document.write, executing researcher-controlled job
    // output as HTML in the app origin (OTTER-721).
    it('never opens a tab when viewing a result', async () => {
        const open = vi.spyOn(window, 'open').mockReturnValue(null)
        renderWithProviders(<ViewFile file={jobFile('results.txt', XSS_PAYLOAD)} />)

        await clickView()

        await screen.findByRole('dialog')
        expect(open).not.toHaveBeenCalled()
    })

    it('renders a script payload as inert text rather than markup', async () => {
        renderWithProviders(<ViewFile file={jobFile('results.txt', XSS_PAYLOAD)} />)

        await clickView()

        const dialog = await screen.findByRole('dialog')
        expect(dialog).toHaveTextContent(XSS_PAYLOAD)
        expect(dialog.querySelector('img')).toBeNull()
        expect(dialog.querySelector('script')).toBeNull()
        expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined()
    })

    // .html routes to the highlight.js viewer, so it is the likeliest to regress into markup.
    it('renders an html result as inert text', async () => {
        renderWithProviders(<ViewFile file={jobFile('report.html', XSS_PAYLOAD)} />)

        await clickView()

        const dialog = await screen.findByRole('dialog')
        expect(dialog).toHaveTextContent(XSS_PAYLOAD)
        expect(dialog.querySelector('img')).toBeNull()
        expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined()
    })

    it('previews an image result as an image', async () => {
        renderWithProviders(<ViewFile file={jobFile('plot.png', 'not-really-png-bytes')} />)

        await clickView()

        const dialog = await screen.findByRole('dialog')
        await waitFor(() => expect(dialog.querySelector('img')).not.toBeNull())
    })

    it('offers a download link alongside the view link', () => {
        renderWithProviders(<ViewFile file={jobFile('results.txt', 'plain output')} />)

        expect(screen.getByRole('link', { name: /download/i })).toHaveAttribute('download', 'results.txt')
    })
})
