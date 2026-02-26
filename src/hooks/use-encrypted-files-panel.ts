import { useQuery } from '@/common'
import { useDecryptFiles, type EncryptedJobFile } from '@/hooks/use-decrypt-files'
import { ENCRYPTED_TO_APPROVED, isApprovedLogType, isEncryptedLogType, logLabel } from '@/lib/file-type-helpers'
import { toSentence } from '@/lib/string'
import type { JobFile, JobFileInfo } from '@/lib/types'
import { fetchApprovedJobFilesAction, fetchEncryptedJobFilesAction } from '@/server/actions/study-job.actions'
import type { LatestJobForStudy } from '@/server/db/queries'
import { notifications } from '@mantine/notifications'
import * as Sentry from '@sentry/nextjs'
import { useEffect, useMemo, useState } from 'react'
import type { FileType } from '@/database/types'

type Options = {
    job: LatestJobForStudy
    onFilesApproved: (files: JobFileInfo[]) => void
}

export type FileRowState = 'locked' | 'decrypted' | 'approved'

export type UnifiedFileRow = {
    key: string
    label: string
    name: string
    fileType: FileType
    state: FileRowState
    file: JobFile | null
}

export function useEncryptedFilesPanel({ job, onFilesApproved }: Options) {
    const [decryptedFiles, setDecryptedFiles] = useState<JobFileInfo[]>([])
    const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
    const [viewingFile, setViewingFile] = useState<JobFile | null>(null)

    const encryptedFileTypes = (job.files ?? [])
        .filter((f) => isEncryptedLogType(f.fileType) || f.fileType === 'ENCRYPTED-RESULT')
        .map((f) => f.fileType)

    const approvedFileTypes = useMemo(() => new Set((job.files ?? []).map((f) => f.fileType)), [job.files])

    const hasPreviouslyApprovedFiles = (job.files ?? []).some(
        (f) => isApprovedLogType(f.fileType) || f.fileType === 'APPROVED-RESULT',
    )

    const { data: previouslyApprovedFiles = [] } = useQuery({
        queryKey: ['approved-files', job.id],
        queryFn: () => fetchApprovedJobFilesAction({ studyJobId: job.id }),
        enabled: hasPreviouslyApprovedFiles,
    })

    const hasUndecryptedFiles = encryptedFileTypes.some((ft) => !approvedFileTypes.has(ENCRYPTED_TO_APPROVED[ft]))

    const undecryptedFileTypes = encryptedFileTypes.filter((ft) => !approvedFileTypes.has(ENCRYPTED_TO_APPROVED[ft]))
    const uniqueLabels = [...new Set(undecryptedFileTypes.map((ft) => logLabel(ft).toLowerCase()))]
    const encryptedFileTypesLabel = toSentence(uniqueLabels)

    const { isLoading: isLoadingBlob, data: encryptedFiles } = useQuery({
        queryKey: ['encrypted-files', job.id],
        queryFn: async () => {
            try {
                return await fetchEncryptedJobFilesAction({ jobId: job.id })
            } catch (error) {
                Sentry.captureException(error)
                form.setFieldError('privateKey', 'Failed to fetch encrypted files, please try again later.')
                throw error
            }
        },
    })

    const {
        decrypt,
        isPending: isDecrypting,
        form,
    } = useDecryptFiles({
        encryptedFiles: encryptedFiles as EncryptedJobFile[] | undefined,
        onSuccess: (files) => {
            setDecryptedFiles(files)
            setSelectedPaths(new Set(files.filter((f) => f.fileType === 'ENCRYPTED-RESULT').map((f) => f.path)))
        },
    })

    useEffect(() => {
        const approved = decryptedFiles.filter((f) => selectedPaths.has(f.path))
        onFilesApproved(approved)
    }, [selectedPaths]) // eslint-disable-line react-hooks/exhaustive-deps

    const toggleFile = (path: string) => {
        setSelectedPaths((prev) => {
            const next = new Set(prev)
            if (next.has(path)) next.delete(path)
            else next.add(path)
            return next
        })
    }

    const shouldShowForm = hasUndecryptedFiles && decryptedFiles.length === 0

    const handleSubmit = form.onSubmit(
        (values) => decrypt(values.privateKey),
        (errors) => {
            if (errors.privateKey) {
                notifications.show({ message: 'Invalid private key', color: 'red' })
            }
        },
    )

    const approvedFilesByType = useMemo(() => {
        const map = new Map<FileType, JobFile>()
        for (const f of previouslyApprovedFiles) {
            map.set(f.fileType, f)
        }
        return map
    }, [previouslyApprovedFiles])

    const decryptedFilesByType = useMemo(() => {
        const map = new Map<FileType, JobFileInfo>()
        for (const f of decryptedFiles) {
            map.set(f.fileType, f)
        }
        return map
    }, [decryptedFiles])

    const fileRows: UnifiedFileRow[] = useMemo(() => {
        const rows: UnifiedFileRow[] = []

        for (const f of job.files ?? []) {
            const isEncrypted = isEncryptedLogType(f.fileType) || f.fileType === 'ENCRYPTED-RESULT'
            const isApproved = isApprovedLogType(f.fileType) || f.fileType === 'APPROVED-RESULT'

            if (!isEncrypted && !isApproved) continue

            const approvedType = isEncrypted ? ENCRYPTED_TO_APPROVED[f.fileType] : f.fileType

            // skip if both encrypted and approved entries exist — we'll use the approved one
            if (isEncrypted && approvedFileTypes.has(approvedType)) continue

            const approvedFile = approvedFilesByType.get(approvedType)
            const decryptedFile = decryptedFilesByType.get(approvedType)

            let state: FileRowState
            let file: JobFile | null = null

            if (approvedFile) {
                state = 'approved'
                file = approvedFile
            } else if (decryptedFile) {
                state = 'decrypted'
                file = decryptedFile
            } else {
                state = 'locked'
            }

            rows.push({
                key: `${f.fileType}-${f.name}`,
                label: logLabel(f.fileType),
                name: decryptedFile?.path ?? approvedFile?.path ?? f.name,
                fileType: f.fileType,
                state,
                file,
            })
        }

        return rows
    }, [job.files, approvedFileTypes, approvedFilesByType, decryptedFilesByType])

    const hasFileRows = fileRows.length > 0

    return {
        fileRows,
        hasFileRows,
        isLoadingBlob,
        shouldShowForm,
        encryptedFileTypesLabel,
        selectedPaths,
        toggleFile,
        isDecrypting,
        form,
        handleSubmit,
        viewingFile,
        openFileViewer: (file: JobFile) => setViewingFile(file),
        closeFileViewer: () => setViewingFile(null),
    }
}
