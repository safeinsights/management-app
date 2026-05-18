import { renderWithProviders, screen } from '@/tests/unit.helpers'
import { waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DownloadBlobLink } from './download-blob-link'

describe('DownloadBlobLink', () => {
    it('creates a generic download blob and revokes it on unmount', async () => {
        const blobs: Blob[] = []
        const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockImplementation((obj: Blob | MediaSource) => {
            blobs.push(obj as Blob)
            return 'blob://download'
        })
        const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

        const { unmount } = renderWithProviders(
            <DownloadBlobLink filename="main.py" fileContent="print(1)" target="_blank" />,
        )

        const link = screen.getByRole('link', { name: /download/i })
        await waitFor(() => expect(link).toHaveAttribute('href', 'blob://download'))

        expect(link).toHaveAttribute('download', 'main.py')
        expect(link).toHaveAttribute('target', '_blank')
        expect(createObjectURL).toHaveBeenCalledTimes(1)
        expect(blobs[0].type).toBe('')

        unmount()

        expect(revokeObjectURL).toHaveBeenCalledWith('blob://download')
    })
})
