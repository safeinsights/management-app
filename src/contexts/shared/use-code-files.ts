import { useState, useCallback, useMemo } from 'react'
import {
    type FileRef,
    type CodeFileState,
    getFileName,
    toMemoryFile,
    toServerFile,
} from './file-types'

export type CodeSource = 'upload' | 'ide' | null

const initialState: CodeFileState = {
    mainFile: null,
    additionalFiles: [],
}

export interface UseCodeFilesReturn {
    codeFiles: CodeFileState
    source: CodeSource
    mainFileName: string | null
    additionalFileNames: string[]
    allFileNames: string[]
    canProceed: boolean
    hasFiles: boolean
    setUploadedFiles: (main: File | null, additional: File[]) => void
    setIDEFiles: (mainFileName: string, fileNames: string[]) => void
    setMainFile: (fileName: string) => void
    removeFile: (fileName: string) => void
    clear: () => void
}

export function useCodeFiles(): UseCodeFilesReturn {
    const [codeFiles, setCodeFilesState] = useState<CodeFileState>(initialState)
    const [source, setSource] = useState<CodeSource>(null)

    const setUploadedFiles = useCallback((main: File | null, additional: File[]) => {
        setCodeFilesState({
            mainFile: main ? toMemoryFile(main) : null,
            additionalFiles: additional.map(toMemoryFile),
        })
        setSource('upload')
    }, [])

    const setIDEFiles = useCallback((mainFileName: string, fileNames: string[]) => {
        const additionalFileNames = fileNames.filter((f) => f !== mainFileName)
        setCodeFilesState({
            mainFile: mainFileName ? toServerFile(mainFileName) : null,
            additionalFiles: additionalFileNames.map((name) => toServerFile(name)),
        })
        setSource('ide')
    }, [])

    const setMainFile = useCallback((fileName: string) => {
        setCodeFilesState((prev) => {
            const allFiles = [prev.mainFile, ...prev.additionalFiles].filter(Boolean) as FileRef[]
            const newMain = allFiles.find((f) => getFileName(f) === fileName)
            if (newMain) {
                const others = allFiles.filter((f) => f !== newMain)
                return { mainFile: newMain, additionalFiles: others }
            }
            return prev
        })
    }, [])

    const removeFile = useCallback((fileName: string) => {
        setCodeFilesState((prev) => {
            if (prev.mainFile && getFileName(prev.mainFile) === fileName) {
                const [newMain, ...rest] = prev.additionalFiles
                return { mainFile: newMain || null, additionalFiles: rest }
            }
            return {
                ...prev,
                additionalFiles: prev.additionalFiles.filter((f) => getFileName(f) !== fileName),
            }
        })
    }, [])

    const clear = useCallback(() => {
        setCodeFilesState(initialState)
        setSource(null)
    }, [])

    const mainFileName = codeFiles.mainFile ? getFileName(codeFiles.mainFile) : null

    const additionalFileNames = useMemo(
        () => codeFiles.additionalFiles.map(getFileName),
        [codeFiles.additionalFiles]
    )

    const allFileNames = useMemo(
        () => [mainFileName, ...additionalFileNames].filter(Boolean) as string[],
        [mainFileName, additionalFileNames]
    )

    const canProceed = codeFiles.mainFile !== null
    const hasFiles = codeFiles.mainFile !== null || codeFiles.additionalFiles.length > 0

    return {
        codeFiles,
        source,
        mainFileName,
        additionalFileNames,
        allFileNames,
        canProceed,
        hasFiles,
        setUploadedFiles,
        setIDEFiles,
        setMainFile,
        removeFile,
        clear,
    }
}
