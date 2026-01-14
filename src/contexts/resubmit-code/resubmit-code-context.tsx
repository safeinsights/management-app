'use client'

import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react'
import dayjs from 'dayjs'
import { useWorkspaceLauncher } from '@/hooks/use-workspace-launcher'
import { useLoadingMessages } from '@/hooks/use-loading-messages'
import { useCodeFiles, getCodeFilesForUpload } from '@/contexts/shared'
import { type ResubmitCodeContextValue, type ResubmitViewMode, type ResubmitStudyData } from './resubmit-code-types'
import { useResubmitIDEFiles } from './hooks/use-resubmit-ide-files'
import { useResubmitMutation } from './hooks/use-resubmit-mutation'

const ResubmitCodeContext = createContext<ResubmitCodeContextValue | null>(null)

export function useResubmitCode(): ResubmitCodeContextValue {
    const context = useContext(ResubmitCodeContext)
    if (!context) {
        throw new Error('useResubmitCode must be used within ResubmitCodeProvider')
    }
    return context
}

interface ResubmitCodeProviderProps {
    children: ReactNode
    study: ResubmitStudyData
}

export function ResubmitCodeProvider({ children, study }: ResubmitCodeProviderProps) {
    const { id: studyId, orgSlug, submittedByOrgSlug: submittingOrgSlug, language } = study

    const [viewMode, setViewMode] = useState<ResubmitViewMode>('upload')
    const goToUpload = useCallback(() => setViewMode('upload'), [])
    const goToReview = useCallback(() => setViewMode('review'), [])
    const goToImportIDE = useCallback(() => setViewMode('import-ide'), [])

    const codeFilesHook = useCodeFiles()
    const ideFiles = useResubmitIDEFiles({ studyId })

    const uploadFilesFromHook = useMemo(() => {
        const { main, additional } = getCodeFilesForUpload(codeFilesHook.codeFiles)
        return main ? [main, ...additional] : additional
    }, [codeFilesHook.codeFiles])

    const setUploadedFilesCompat = useCallback(
        (files: File[], mainFileName: string) => {
            const main = files.find((f) => f.name === mainFileName) || null
            const additional = files.filter((f) => f !== main)
            codeFilesHook.setUploadedFiles(main, additional)
        },
        [codeFilesHook],
    )

    const {
        launchWorkspace,
        isLaunching: isLaunchingWorkspace,
        isCreatingWorkspace,
        error: launchError,
    } = useWorkspaceLauncher({
        studyId,
        onSuccess: goToImportIDE,
    })

    const isIDELoading = isLaunchingWorkspace || isCreatingWorkspace
    const { messageWithEllipsis: ideLoadingMessage } = useLoadingMessages(isIDELoading)

    const { resubmitFromUpload, resubmitFromIDE, isPending } = useResubmitMutation({
        studyId,
        submittingOrgSlug,
    })

    const canSubmitUpload = codeFilesHook.canProceed && codeFilesHook.source === 'upload'

    const uploadLastModified = useMemo(() => {
        if (uploadFilesFromHook.length === 0) return null
        const maxTimestamp = Math.max(...uploadFilesFromHook.map((f) => f.lastModified))
        return dayjs(maxTimestamp).format('MMM D, YYYY h:mm:ss A')
    }, [uploadFilesFromHook])

    const resubmitStudy = useCallback(() => {
        if (viewMode === 'import-ide') {
            if (!ideFiles.canSubmitFromIDE) return
            resubmitFromIDE({
                mainFileName: ideFiles.currentIdeMainFile,
                fileNames: ideFiles.filteredIdeFiles,
            })
        } else {
            if (!canSubmitUpload) return
            const { main, additional } = getCodeFilesForUpload(codeFilesHook.codeFiles)
            if (!main || !codeFilesHook.mainFileName) return
            resubmitFromUpload({
                mainFileName: codeFilesHook.mainFileName,
                mainFile: main,
                additionalFiles: additional,
            })
        }
    }, [viewMode, ideFiles, canSubmitUpload, codeFilesHook, resubmitFromIDE, resubmitFromUpload])

    const value: ResubmitCodeContextValue = useMemo(
        () => ({
            studyId,
            orgSlug,
            submittingOrgSlug,
            language,

            viewMode,
            setViewMode,
            goToUpload,
            goToReview,
            goToImportIDE,

            uploadedFiles: uploadFilesFromHook,
            uploadMainFile: codeFilesHook.mainFileName,
            uploadLastModified,
            canSubmitUpload,
            setUploadedFiles: setUploadedFilesCompat,
            setUploadMainFile: codeFilesHook.setMainFile,
            removeUploadedFile: codeFilesHook.removeFile,

            ...ideFiles,

            isIDELoading,
            ideLoadingMessage,
            launchError,
            launchWorkspace,

            resubmitStudy,
            isPending,
        }),
        [
            studyId,
            orgSlug,
            submittingOrgSlug,
            language,
            viewMode,
            goToUpload,
            goToReview,
            goToImportIDE,
            uploadFilesFromHook,
            uploadLastModified,
            codeFilesHook,
            canSubmitUpload,
            setUploadedFilesCompat,
            ideFiles,
            isIDELoading,
            ideLoadingMessage,
            launchError,
            launchWorkspace,
            resubmitStudy,
            isPending,
        ],
    )

    return <ResubmitCodeContext.Provider value={value}>{children}</ResubmitCodeContext.Provider>
}
