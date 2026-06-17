import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@/tests/unit.helpers'
import { JobResults } from './job-results'
import { fetchApprovedJobFilesAction } from '@/server/actions/study-job.actions'
import { type JobFile } from '@/lib/types'
import { type FileType } from '@/database/types'

vi.mock('@/server/actions/study-job.actions', () => ({
    fetchApprovedJobFilesAction: vi.fn(() => []),
}))

function pngBuffer(): ArrayBuffer {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
    return bytes.buffer as ArrayBuffer
}

function textBuffer(text: string): ArrayBuffer {
    return new TextEncoder().encode(text).buffer as ArrayBuffer
}

describe('JobResults', () => {
    it('opens image preview modal when clicking View on a PNG result', async () => {
        const pngFile: JobFile = {
            contents: pngBuffer(),
            path: 'output/plot.png',
            fileType: 'APPROVED-RESULT' as FileType,
        }

        vi.mocked(fetchApprovedJobFilesAction).mockResolvedValue([pngFile])

        const job = { id: 'job-1' } as Parameters<typeof JobResults>[0]['job']
        renderWithProviders(<JobResults job={job} />)

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /view/i })).toBeDefined()
        })

        fireEvent.click(screen.getByRole('button', { name: /view/i }))

        await waitFor(() => {
            expect(screen.getByRole('dialog')).toBeDefined()
            expect(screen.getByAltText('output/plot.png')).toBeDefined()
        })
    })

    it('opens a new tab when clicking View on a text result', async () => {
        const csvFile: JobFile = {
            contents: textBuffer('name,age\nAlice,30'),
            path: 'results.csv',
            fileType: 'APPROVED-RESULT' as FileType,
        }

        vi.mocked(fetchApprovedJobFilesAction).mockResolvedValue([csvFile])

        const mockWrite = vi.fn()
        const mockClose = vi.fn()
        vi.spyOn(window, 'open').mockReturnValue({
            document: { write: mockWrite, close: mockClose },
        } as unknown as Window)

        const job = { id: 'job-2' } as Parameters<typeof JobResults>[0]['job']
        renderWithProviders(<JobResults job={job} />)

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /view/i })).toBeDefined()
        })

        fireEvent.click(screen.getByRole('button', { name: /view/i }))

        expect(window.open).toHaveBeenCalledWith('about:blank', '_blank')
        expect(mockWrite).toHaveBeenCalled()
        expect(screen.queryByRole('dialog')).toBeNull()
    })
})
