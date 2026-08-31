import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@/tests/unit.helpers'
import { PdfDropzone } from './pdf-dropzone'

const drop = (file: File) => {
    const zone = document.querySelector('.mantine-Dropzone-root')
    if (!zone) throw new Error('dropzone did not render')

    fireEvent.drop(zone, {
        dataTransfer: {
            files: [file],
            items: [{ kind: 'file', type: file.type, getAsFile: () => file }],
            types: ['Files'],
        },
    })
}

const pdf = () => new File(['pdf bytes'], 'agreement.pdf', { type: 'application/pdf' })
const notAPdf = () => new File(['doc bytes'], 'agreement.docx', { type: 'application/msword' })

describe('PdfDropzone', () => {
    it('says so when a file is refused, rather than doing nothing', async () => {
        const onChange = vi.fn()
        renderWithProviders(<PdfDropzone label="Signed agreement" file={null} onChange={onChange} />)

        drop(notAPdf())

        expect(await screen.findByText(/Only a single PDF|not accepted/i)).toBeDefined()
        expect(onChange).not.toHaveBeenCalled()
    })

    it('clears the refusal once an acceptable file arrives', async () => {
        const onChange = vi.fn()
        renderWithProviders(<PdfDropzone label="Signed agreement" file={null} onChange={onChange} />)

        drop(notAPdf())
        expect(await screen.findByText(/not accepted/i)).toBeDefined()

        drop(pdf())

        await waitFor(() => expect(onChange).toHaveBeenCalled())
        expect(screen.queryByText(/not accepted/i)).toBeNull()
    })
})
