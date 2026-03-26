import { describe, it, expect, renderHook, act } from '@/tests/unit.helpers'
import { useFileListManager } from './use-file-list-manager'

describe('useFileListManager', () => {
    const files = ['main.r', 'helper.r', 'utils.r']

    it('returns first file as mainFile when suggestedMain is null', () => {
        const { result } = renderHook(() => useFileListManager({ files, suggestedMain: null }))

        expect(result.current.mainFile).toBe('main.r')
    })

    it('uses suggestedMain as mainFile when provided', () => {
        const { result } = renderHook(() => useFileListManager({ files, suggestedMain: 'helper.r' }))

        expect(result.current.mainFile).toBe('helper.r')
    })

    it('removes a file from filteredFiles', () => {
        const { result } = renderHook(() => useFileListManager({ files, suggestedMain: null }))

        act(() => {
            result.current.removeFile('helper.r')
        })

        expect(result.current.filteredFiles).toEqual(['main.r', 'utils.r'])
    })

    it('clears mainFileOverride when removed file was the override', () => {
        const { result } = renderHook(() => useFileListManager({ files, suggestedMain: null }))

        act(() => {
            result.current.setMainFile('utils.r')
        })
        expect(result.current.mainFile).toBe('utils.r')

        act(() => {
            result.current.removeFile('utils.r')
        })

        // Falls back to first remaining file since override was cleared
        expect(result.current.mainFile).toBe('main.r')
    })

    it('overrides mainFile via setMainFile', () => {
        const { result } = renderHook(() => useFileListManager({ files, suggestedMain: 'helper.r' }))

        act(() => {
            result.current.setMainFile('utils.r')
        })

        expect(result.current.mainFile).toBe('utils.r')
    })

    it('prefers mainFileOverride > suggestedMain > first file', () => {
        const { result } = renderHook(() => useFileListManager({ files, suggestedMain: 'helper.r' }))

        // suggestedMain wins over first file
        expect(result.current.mainFile).toBe('helper.r')

        // override wins over suggestedMain
        act(() => {
            result.current.setMainFile('utils.r')
        })
        expect(result.current.mainFile).toBe('utils.r')
    })

    it('returns empty string when no files remain', () => {
        const { result } = renderHook(() => useFileListManager({ files: ['only.r'], suggestedMain: null }))

        act(() => {
            result.current.removeFile('only.r')
        })

        expect(result.current.mainFile).toBe('')
        expect(result.current.filteredFiles).toEqual([])
    })

    it('falls back to first remaining file when suggestedMain is removed', () => {
        const { result } = renderHook(() => useFileListManager({ files, suggestedMain: 'main.r' }))

        expect(result.current.mainFile).toBe('main.r')

        act(() => {
            result.current.removeFile('main.r')
        })

        expect(result.current.filteredFiles).toEqual(['helper.r', 'utils.r'])
        expect(result.current.mainFile).toBe('helper.r')
    })

    it('clears removedFiles and mainFileOverride on reset', () => {
        const { result } = renderHook(() => useFileListManager({ files, suggestedMain: null }))

        act(() => {
            result.current.removeFile('helper.r')
            result.current.setMainFile('utils.r')
        })

        expect(result.current.filteredFiles).toEqual(['main.r', 'utils.r'])
        expect(result.current.mainFile).toBe('utils.r')

        act(() => {
            result.current.reset()
        })

        expect(result.current.filteredFiles).toEqual(files)
        expect(result.current.mainFile).toBe('main.r') // back to first file (no override, no suggestedMain)
    })
})
