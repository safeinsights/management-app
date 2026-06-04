import { useQuery } from '@/common'
import { useDecryptFiles, type EncryptedJobFile } from '@/hooks/use-decrypt-files'
import {
    ENCRYPTED_TO_APPROVED,
    encryptedTypeForApproved,
    isApprovedLogType,
    isEncryptedLogType,
    isResultFile,
    logLabel,
} from '@/lib/file-type-helpers'
import { toSentence } from '@/lib/string'
import type { JobFile, JobFileInfo } from '@/lib/types'
import { fetchApprovedJobFilesAction, fetchEncryptedJobFilesAction } from '@/server/actions/study-job.actions'
import type { LatestJobForStudy } from '@/server/db/queries'
import { notifications } from '@mantine/notifications'
import * as Sentry from '@sentry/nextjs'
import { useEffect, useMemo, useState } from 'react'
import type { FileType } from '@/database/types'
import type { FileInfo } from 'si-encryption/job-results/types'

type Options = {
    job: LatestJobForStudy
    onFilesApproved: (files: JobFileInfo[]) => void
}

export type FileRowState = 'locked' | 'decrypted' | 'approved' | 'not-shared'

export type UnifiedFileRow = {
    key: string
    label: string
    name: string
    bytes: number | null
    fileType: FileType
    state: FileRowState
    file: JobFile | null
}

export function useEncryptedFilesPanel({ job, onFilesApproved }: Options) {
    const [decryptedFiles, setDecryptedFiles] = useState<JobFileInfo[]>([])
    const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
    const [viewingFile, setViewingFile] = useState<JobFile | null>(null)

    const approvedFileTypes = useMemo(() => new Set((job.files ?? []).map((f) => f.fileType)), [job.files])

    const hasPreviouslyApprovedFiles = (job.files ?? []).some(
        (f) => isApprovedLogType(f.fileType) || f.fileType === 'APPROVED-RESULT',
    )

    // Once a job is approved, files the DO withheld are surfaced as "not shared" (red X) rather than hidden.
    const isJobApproved = (job.statusChanges ?? []).some((sc) => sc.status === 'FILES-APPROVED')

    // Approved files are now re-encrypted (same shape as encrypted files). We use them
    // to know *which* files were shared; their plaintext for display comes from decrypting.
    const { data: previouslyApprovedFiles = [] } = useQuery({
        queryKey: ['approved-files', job.id],
        queryFn: () => fetchApprovedJobFilesAction({ studyJobId: job.id }),
        enabled: hasPreviouslyApprovedFiles,
    })

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
            setSelectedPaths(new Set(files.filter(isResultFile).map((f) => f.path)))
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

    const encryptedFileTypes = (job.files ?? [])
        .filter((f) => isEncryptedLogType(f.fileType) || f.fileType === 'ENCRYPTED-RESULT')
        .map((f) => f.fileType)

    const hasUndecryptedFiles = encryptedFileTypes.some((ft) => !approvedFileTypes.has(ENCRYPTED_TO_APPROVED[ft]))
    const shouldShowForm = hasUndecryptedFiles && decryptedFiles.length === 0

    const undecryptedFileTypes = encryptedFileTypes.filter((ft) => !approvedFileTypes.has(ENCRYPTED_TO_APPROVED[ft]))
    const encryptedFileTypesLabel = toSentence([
        ...new Set(undecryptedFileTypes.map((ft) => logLabel(ft).toLowerCase())),
    ])

    const handleSubmit = form.onSubmit(
        (values) => decrypt(values.privateKey),
        (errors) => {
            if (errors.privateKey) {
                notifications.show({ message: 'Invalid private key', color: 'red' })
            }
        },
    )

    const decryptedFilesByType = useMemo(() => {
        const map = new Map<FileType, JobFileInfo[]>()
        for (const f of decryptedFiles) {
            const list = map.get(f.fileType) ?? []
            list.push(f)
            map.set(f.fileType, list)
        }
        return map
    }, [decryptedFiles])

    // Names + sizes of the files that were shared (approved), per approved fileType.
    const approvedMetaByType = useMemo(() => {
        const map = new Map<FileType, FileInfo[]>()
        for (const file of previouslyApprovedFiles) {
            const list = map.get(file.fileType) ?? []
            list.push(...file.metadata)
            map.set(file.fileType, list)
        }
        return map
    }, [previouslyApprovedFiles])

    const metadataByFileType = useMemo(() => {
        const map = new Map<FileType, FileInfo[]>()
        for (const file of encryptedFiles ?? []) {
            map.set(file.fileType, file.metadata)
        }
        return map
    }, [encryptedFiles])

    const fileRows: UnifiedFileRow[] = useMemo(() => {
        const rows: UnifiedFileRow[] = []
        const seenApprovedTypes = new Set<FileType>()

        for (const f of job.files ?? []) {
            const isEncrypted = isEncryptedLogType(f.fileType) || f.fileType === 'ENCRYPTED-RESULT'
            const isApproved = isApprovedLogType(f.fileType) || f.fileType === 'APPROVED-RESULT'

            if (!isEncrypted && !isApproved) continue

            const approvedType = isEncrypted ? ENCRYPTED_TO_APPROVED[f.fileType] : f.fileType

            // skip if both encrypted and approved entries exist — we'll use the approved one
            if (isEncrypted && approvedFileTypes.has(approvedType)) continue

            // an archive can yield multiple per-file APPROVED-RESULT rows in studyJobFile;
            // process each fileType once so rows aren't multiplied by N×N
            if (seenApprovedTypes.has(approvedType)) continue
            seenApprovedTypes.add(approvedType)

            const encryptedType = isEncrypted ? f.fileType : encryptedTypeForApproved(f.fileType)
            const approvedMeta = approvedMetaByType.get(approvedType) ?? []
            const decryptedFilesForType = decryptedFilesByType.get(approvedType) ?? []
            const metaList = metadataByFileType.get(encryptedType) ?? []
            const label = logLabel(f.fileType)

            // Approved (shared) files. Their plaintext for view/download comes from the
            // decrypted originals (matched by name) once the DO has entered their key.
            if (approvedMeta.length > 0) {
                const approvedNames = new Set(approvedMeta.map((m) => m.path))
                for (const meta of approvedMeta) {
                    const decrypted = decryptedFilesForType.find((d) => d.path === meta.path) ?? null
                    rows.push({
                        key: `${f.fileType}-approved-${meta.path}`,
                        label,
                        name: meta.path,
                        bytes: meta.bytes,
                        fileType: f.fileType,
                        state: 'approved',
                        file: decrypted,
                    })
                }
                // Withheld files are surfaced only once metadata is available to enumerate them.
                for (const meta of metaList) {
                    if (approvedNames.has(meta.path)) continue
                    rows.push({
                        key: `${f.fileType}-not-shared-${meta.path}`,
                        label,
                        name: meta.path,
                        bytes: meta.bytes,
                        fileType: f.fileType,
                        state: 'not-shared',
                        file: null,
                    })
                }
            } else if (decryptedFilesForType.length > 0) {
                for (const decryptedFile of decryptedFilesForType) {
                    const meta = metaList.find((m) => m.path === decryptedFile.path)
                    rows.push({
                        key: `${f.fileType}-decrypted-${decryptedFile.path}`,
                        label,
                        name: decryptedFile.path,
                        bytes: meta?.bytes ?? decryptedFile.contents.byteLength,
                        fileType: f.fileType,
                        state: 'decrypted',
                        file: decryptedFile,
                    })
                }
            } else if (metaList.length > 0) {
                // A type with metadata but no approved files. If the job is approved and no APPROVED-*
                // rows exist for it, the whole type was withheld → red X. Otherwise keep the lock icon.
                const withheld = isJobApproved && !approvedFileTypes.has(approvedType)
                for (const meta of metaList) {
                    rows.push({
                        key: `${f.fileType}-${withheld ? 'not-shared' : 'locked'}-${meta.path}`,
                        label,
                        name: meta.path,
                        bytes: meta.bytes,
                        fileType: f.fileType,
                        state: withheld ? 'not-shared' : 'locked',
                        file: null,
                    })
                }
            } else {
                rows.push({
                    key: `${f.fileType}-${f.name}`,
                    label,
                    name: f.name,
                    bytes: null,
                    fileType: f.fileType,
                    state: 'locked',
                    file: null,
                })
            }
        }

        return rows
    }, [job.files, isJobApproved, approvedFileTypes, approvedMetaByType, decryptedFilesByType, metadataByFileType])

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
