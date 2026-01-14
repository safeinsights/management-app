import { describe, it, expect, act } from '@/tests/unit.helpers'
import { renderHook } from '@testing-library/react'
import { useDocumentFiles } from './use-document-files'

const mockFile = (name: string) => new File(['content'], name, { type: 'application/pdf' })

describe('useDocumentFiles', () => {
    it('returns initial empty state', () => {
        const { result } = renderHook(() => useDocumentFiles())
        expect(result.current.documentFiles.description).toBeNull()
        expect(result.current.existingFiles).toBeUndefined()
    })

    it('sets document file as MemoryFile', () => {
        const { result } = renderHook(() => useDocumentFiles())
        act(() => result.current.setDocumentFile('description', mockFile('desc.pdf')))

        expect(result.current.documentFiles.description?.type).toBe('memory')
    })

    it('preserves other documents when setting one', () => {
        const { result } = renderHook(() => useDocumentFiles())
        act(() => {
            result.current.setDocumentFile('description', mockFile('desc.pdf'))
            result.current.setDocumentFile('irb', mockFile('irb.pdf'))
        })

        expect(result.current.documentFiles.description).not.toBeNull()
        expect(result.current.documentFiles.irb).not.toBeNull()
    })

    it('sets existing documents from server paths', () => {
        const { result } = renderHook(() => useDocumentFiles())
        act(() => result.current.setExistingDocuments({ description: '/path/desc.pdf' }))

        expect(result.current.documentFiles.description?.type).toBe('server')
    })

    it('initializes from paths and tracks existingFiles', () => {
        const { result } = renderHook(() => useDocumentFiles())
        act(() =>
            result.current.initDocumentFilesFromPaths({
                descriptionDocPath: '/docs/desc.pdf',
                irbDocPath: '/docs/irb.pdf',
            }),
        )

        expect(result.current.documentFiles.description?.type).toBe('server')
        expect(result.current.existingFiles?.descriptionDocPath).toBe('/docs/desc.pdf')
    })

    it('resets all state', () => {
        const { result } = renderHook(() => useDocumentFiles())
        act(() => {
            result.current.setDocumentFile('description', mockFile('desc.pdf'))
            result.current.initDocumentFilesFromPaths({ irbDocPath: '/docs/irb.pdf' })
        })
        act(() => result.current.resetDocumentFiles())

        expect(result.current.documentFiles.description).toBeNull()
        expect(result.current.existingFiles).toBeUndefined()
    })
})
