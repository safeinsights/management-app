import { describe, it, expect, act } from '@/tests/unit.helpers'
import { renderHook } from '@testing-library/react'
import { useCodeFiles } from './use-code-files'

const mockFile = (name: string) => new File(['content'], name)

describe('useCodeFiles', () => {
    it('returns initial empty state', () => {
        const { result } = renderHook(() => useCodeFiles())
        expect(result.current.source).toBeNull()
        expect(result.current.mainFileName).toBeNull()
        expect(result.current.canProceed).toBe(false)
    })

    it('sets uploaded files as MemoryFile refs', () => {
        const { result } = renderHook(() => useCodeFiles())
        act(() => result.current.setUploadedFiles(mockFile('main.py'), [mockFile('helper.py')]))

        expect(result.current.source).toBe('upload')
        expect(result.current.mainFileName).toBe('main.py')
        expect(result.current.additionalFileNames).toEqual(['helper.py'])
        expect(result.current.codeFiles.mainFile?.type).toBe('memory')
    })

    it('sets IDE files as ServerFile refs', () => {
        const { result } = renderHook(() => useCodeFiles())
        act(() => result.current.setIDEFiles('main.R', ['main.R', 'helper.R']))

        expect(result.current.source).toBe('ide')
        expect(result.current.mainFileName).toBe('main.R')
        expect(result.current.additionalFileNames).toEqual(['helper.R'])
        expect(result.current.codeFiles.mainFile?.type).toBe('server')
    })

    it('clears upload files when switching to IDE (exclusive switching)', () => {
        const { result } = renderHook(() => useCodeFiles())
        act(() => result.current.setUploadedFiles(mockFile('main.py'), []))
        act(() => result.current.setIDEFiles('main.R', ['main.R']))

        expect(result.current.source).toBe('ide')
        expect(result.current.codeFiles.mainFile?.type).toBe('server')
    })

    it('promotes additional file to main when setMainFile called', () => {
        const { result } = renderHook(() => useCodeFiles())
        act(() => result.current.setUploadedFiles(mockFile('main.py'), [mockFile('helper.py')]))
        act(() => result.current.setMainFile('helper.py'))

        expect(result.current.mainFileName).toBe('helper.py')
        expect(result.current.additionalFileNames).toContain('main.py')
    })

    it('auto-promotes first additional file when main is removed', () => {
        const { result } = renderHook(() => useCodeFiles())
        act(() => result.current.setUploadedFiles(mockFile('main.py'), [mockFile('helper.py')]))
        act(() => result.current.removeFile('main.py'))

        expect(result.current.mainFileName).toBe('helper.py')
        expect(result.current.additionalFileNames).toEqual([])
    })

    it('clears all state on clear()', () => {
        const { result } = renderHook(() => useCodeFiles())
        act(() => result.current.setUploadedFiles(mockFile('main.py'), []))
        act(() => result.current.clear())

        expect(result.current.source).toBeNull()
        expect(result.current.mainFileName).toBeNull()
        expect(result.current.hasFiles).toBe(false)
    })
})
