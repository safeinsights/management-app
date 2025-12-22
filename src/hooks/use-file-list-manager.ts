import { useState, useCallback, useMemo } from 'react'

export interface UseFileListManagerOptions {
    files: string[]
    suggestedMain: string | null
}

export interface UseFileListManagerReturn {
    filteredFiles: string[]
    mainFile: string
    setMainFile: (fileName: string) => void
    removeFile: (fileName: string) => void
    reset: () => void
}

export function useFileListManager({ files, suggestedMain }: UseFileListManagerOptions): UseFileListManagerReturn {
    const [removedFiles, setRemovedFiles] = useState<Set<string>>(new Set())
    const [mainFileOverride, setMainFileOverride] = useState<string | null>(null)

    const filteredFiles = useMemo(() => files.filter((f) => !removedFiles.has(f)), [files, removedFiles])

    const mainFile = useMemo(
        () => mainFileOverride ?? suggestedMain ?? filteredFiles[0] ?? '',
        [mainFileOverride, suggestedMain, filteredFiles],
    )

    const setMainFile = useCallback((fileName: string) => {
        setMainFileOverride(fileName)
    }, [])

    const removeFile = useCallback((fileName: string) => {
        setRemovedFiles((prev) => {
            const newSet = new Set(prev)
            newSet.add(fileName)
            return newSet
        })
        setMainFileOverride((prev) => (prev === fileName ? null : prev))
    }, [])

    const reset = useCallback(() => {
        setRemovedFiles(new Set())
        setMainFileOverride(null)
    }, [])

    return {
        filteredFiles,
        mainFile,
        setMainFile,
        removeFile,
        reset,
    }
}
