import { useState, useCallback, useMemo } from 'react'
import { FileRejection } from '@mantine/dropzone'
import { notifications } from '@mantine/notifications'
import { uniqueBy } from 'remeda'
import { useStudyRequest } from '@/contexts/study-request'
import { getFileName, type FileRef } from '@/contexts/shared/file-types'

interface UseCodeUploadModalOptions {
    onConfirm: () => void
    onClose: () => void
}

export function useCodeUploadModal({ onConfirm, onClose }: UseCodeUploadModalOptions) {
    const { codeFiles, setCodeFiles, removeCodeFile, setMainCodeFile, clearCodeFiles } = useStudyRequest()
    const [selectedMainFile, setSelectedMainFile] = useState<string>('')

    const allFiles: FileRef[] = useMemo(
        () => [...(codeFiles.mainFile ? [codeFiles.mainFile] : []), ...codeFiles.additionalFiles],
        [codeFiles.mainFile, codeFiles.additionalFiles],
    )

    const handleDrop = useCallback(
        (files: File[]) => {
            const existingFiles = allFiles
                .filter((f): f is { type: 'memory'; file: File } => f.type === 'memory')
                .map((f) => f.file)

            const combinedFiles = uniqueBy([...files, ...existingFiles], (file) => file.name)

            const mainFileName = selectedMainFile || combinedFiles[0]?.name || ''
            const mainFile = combinedFiles.find((f) => f.name === mainFileName) || null
            const additionalFiles = combinedFiles.filter((f) => f.name !== mainFileName)

            setCodeFiles(mainFile, additionalFiles)

            if (!selectedMainFile && combinedFiles.length > 0) {
                setSelectedMainFile(combinedFiles[0].name)
            }
        },
        [allFiles, selectedMainFile, setCodeFiles],
    )

    const handleReject = useCallback((rejections: FileRejection[]) => {
        notifications.show({
            color: 'red',
            title: 'Rejected files',
            message: rejections
                .map((rej) => `${rej.file.name} ${rej.errors.map((err) => `${err.code}: ${err.message}`).join(', ')}`)
                .join('\n'),
        })
    }, [])

    const handleRemoveFile = useCallback(
        (fileName: string) => {
            removeCodeFile(fileName)
            if (selectedMainFile === fileName) {
                const remaining = allFiles.filter((f) => getFileName(f) !== fileName)
                setSelectedMainFile(remaining.length > 0 ? getFileName(remaining[0]) : '')
            }
        },
        [allFiles, removeCodeFile, selectedMainFile],
    )

    const handleConfirm = useCallback(() => {
        if (!selectedMainFile || allFiles.length === 0) return

        setMainCodeFile(selectedMainFile)
        onConfirm()
    }, [selectedMainFile, allFiles.length, setMainCodeFile, onConfirm])

    const handleCancel = useCallback(() => {
        clearCodeFiles()
        setSelectedMainFile('')
        onClose()
    }, [clearCodeFiles, onClose])

    const canConfirm = !!selectedMainFile && allFiles.length > 0

    return {
        allFiles,
        selectedMainFile,
        setSelectedMainFile,
        handleDrop,
        handleReject,
        handleRemoveFile,
        handleConfirm,
        handleCancel,
        canConfirm,
    }
}
