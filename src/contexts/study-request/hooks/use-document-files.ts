import { useState, useCallback } from 'react'
import { type DocumentFileState, pathToServerFile, toMemoryFile } from '@/contexts/shared/file-types'
import { initialDocumentFilesState, type ExistingFiles } from '../study-request-types'

export interface UseDocumentFilesReturn {
    documentFiles: DocumentFileState
    existingFiles: ExistingFiles | undefined
    setDocumentFile: (type: 'description' | 'irb' | 'agreement', file: File) => void
    setExistingDocuments: (docs: { description?: string | null; irb?: string | null; agreement?: string | null }) => void
    initDocumentFilesFromPaths: (paths: {
        descriptionDocPath?: string | null
        irbDocPath?: string | null
        agreementDocPath?: string | null
    }) => void
    resetDocumentFiles: () => void
}

export function useDocumentFiles(): UseDocumentFilesReturn {
    const [documentFiles, setDocumentFilesState] = useState<DocumentFileState>(initialDocumentFilesState)
    const [existingFiles, setExistingFiles] = useState<ExistingFiles | undefined>(undefined)

    const setDocumentFile = useCallback((type: 'description' | 'irb' | 'agreement', file: File) => {
        setDocumentFilesState((prev) => ({
            ...prev,
            [type]: toMemoryFile(file),
        }))
    }, [])

    const setExistingDocuments = useCallback(
        (docs: { description?: string | null; irb?: string | null; agreement?: string | null }) => {
            setDocumentFilesState((prev) => ({
                description: pathToServerFile(docs.description) ?? prev.description,
                irb: pathToServerFile(docs.irb) ?? prev.irb,
                agreement: pathToServerFile(docs.agreement) ?? prev.agreement,
            }))
        },
        [],
    )

    const initDocumentFilesFromPaths = useCallback(
        (paths: { descriptionDocPath?: string | null; irbDocPath?: string | null; agreementDocPath?: string | null }) => {
            setDocumentFilesState({
                description: pathToServerFile(paths.descriptionDocPath),
                irb: pathToServerFile(paths.irbDocPath),
                agreement: pathToServerFile(paths.agreementDocPath),
            })
            setExistingFiles({
                descriptionDocPath: paths.descriptionDocPath,
                irbDocPath: paths.irbDocPath,
                agreementDocPath: paths.agreementDocPath,
            })
        },
        [],
    )

    const resetDocumentFiles = useCallback(() => {
        setDocumentFilesState(initialDocumentFilesState)
        setExistingFiles(undefined)
    }, [])

    return {
        documentFiles,
        existingFiles,
        setDocumentFile,
        setExistingDocuments,
        initDocumentFilesFromPaths,
        resetDocumentFiles,
    }
}
