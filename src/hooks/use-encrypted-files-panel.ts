import { useQuery } from '@/common'
import { useDecryptFiles, type EncryptedJobFile } from '@/hooks/use-decrypt-files'
import { isEncryptedLogType, isResultFile, logLabel } from '@/lib/file-type-helpers'
import { toSentence } from '@/lib/string'
import type { JobFile, JobFileInfo } from '@/lib/types'
import { fetchEncryptedJobFilesAction, fetchSharedFileIdsAction } from '@/server/actions/study-job.actions'
import type { LatestJobForStudy } from '@/server/db/queries'
import { notifications } from '@mantine/notifications'
import * as Sentry from '@sentry/nextjs'
import { useEffect, useMemo, useState } from 'react'
import type { FileType } from '@/database/types'

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

function isEncryptedFile(fileType: FileType): boolean {
    return isEncryptedLogType(fileType) || fileType === 'ENCRYPTED-RESULT'
}

// State precedence: shared (approved) wins as the durable signal; otherwise a freshly
// decrypted file is selectable; an approved job with no box for this file means it was
// withheld; everything else is still locked.
function fileRowState(opts: { shared: boolean; decrypted: boolean; jobApproved: boolean }): FileRowState {
    if (opts.shared) return 'approved'
    if (opts.decrypted) return 'decrypted'
    if (opts.jobApproved) return 'not-shared'
    return 'locked'
}

export function useEncryptedFilesPanel({ job, onFilesApproved }: Options) {
    const [decryptedFiles, setDecryptedFiles] = useState<JobFileInfo[]>([])
    const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
    const [viewingFile, setViewingFile] = useState<JobFile | null>(null)

    // Once a job is approved, files the DO withheld are surfaced as "not shared" (red X) rather than hidden.
    const isJobApproved = (job.statusChanges ?? []).some((sc) => sc.status === 'FILES-APPROVED')

    // Which files have been shared with researchers (a lab-org PO box exists). Existence
    // of a box is the approval/shared signal — there is no plaintext approved copy.
    const { data: sharedFileIds = [] } = useQuery({
        queryKey: ['shared-file-ids', job.id],
        queryFn: () => fetchSharedFileIdsAction({ jobId: job.id }),
        enabled: isJobApproved,
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

    const encryptedRows = useMemo(() => (job.files ?? []).filter((f) => isEncryptedFile(f.fileType)), [job.files])

    const shouldShowForm = encryptedRows.length > 0 && decryptedFiles.length === 0

    const encryptedFileTypesLabel = toSentence([
        ...new Set(encryptedRows.map((f) => logLabel(f.fileType).toLowerCase())),
    ])

    const decryptedById = useMemo(() => {
        const map = new Map<string, JobFileInfo>()
        for (const f of decryptedFiles) map.set(f.sourceId, f)
        return map
    }, [decryptedFiles])

    const sharedIdSet = useMemo(() => new Set(sharedFileIds), [sharedFileIds])

    // One row per decomposed encrypted file.
    const fileRows: UnifiedFileRow[] = useMemo(() => {
        return encryptedRows.map((f) => {
            const decrypted = decryptedById.get(f.id) ?? null
            const state = fileRowState({
                shared: sharedIdSet.has(f.id),
                decrypted: !!decrypted,
                jobApproved: isJobApproved,
            })
            return {
                key: `${f.fileType}-${f.id}`,
                label: logLabel(f.fileType),
                name: f.name,
                bytes: f.bytes,
                fileType: f.fileType,
                state,
                file: decrypted,
            }
        })
    }, [encryptedRows, decryptedById, sharedIdSet, isJobApproved])

    const hasFileRows = fileRows.length > 0

    const handleSubmit = form.onSubmit(
        (values) => decrypt(values.privateKey),
        (errors) => {
            if (errors.privateKey) {
                notifications.show({ message: 'Invalid private key', color: 'red' })
            }
        },
    )

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
