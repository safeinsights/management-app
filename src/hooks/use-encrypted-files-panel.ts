import { useQuery } from '@/common'
import { useDecryptFiles } from '@/hooks/use-decrypt-files'
import { isEncryptedLogType, logLabel } from '@/lib/file-type-helpers'
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

export type FileRowState = 'locked' | 'decrypted' | 'approved'

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

export function useEncryptedFilesPanel({ job, onFilesApproved }: Options) {
    const [decryptedFiles, setDecryptedFiles] = useState<JobFileInfo[]>([])
    const [viewingFile, setViewingFile] = useState<JobFile | null>(null)

    const isJobApproved = (job.statusChanges ?? []).some((sc) => sc.status === 'FILES-APPROVED')

    // Which files are shared with researchers — all of the job's files once it's FILES-APPROVED,
    // none before (all-or-nothing; see getSharedFileIdsForJob). There is no plaintext approved copy.
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
        encryptedFiles,
        onSuccess: (files) => setDecryptedFiles(files),
    })

    // All-or-nothing: approving shares the entire decrypted package — results AND logs — with
    // the researchers (no per-file selection). Every decrypted artifact carries its own rawAesKey,
    // so buildSharedFiles re-wraps each for the lab keys. (Per-artifact selection may return if Phil
    // wants logs individually withholdable; for now approval shares everything.)
    useEffect(() => {
        onFilesApproved(decryptedFiles)
    }, [decryptedFiles]) // eslint-disable-line react-hooks/exhaustive-deps

    const encryptedRows = useMemo(() => (job.files ?? []).filter((f) => isEncryptedFile(f.fileType)), [job.files])

    const shouldShowForm = encryptedRows.length > 0 && decryptedFiles.length === 0

    const sharedIdSet = useMemo(() => new Set(sharedFileIds), [sharedFileIds])

    // Before decryption: one locked row per encrypted artifact (results, logs); size is unknown
    // until decrypted (pre-encryption byte counts aren't stored). After: one row per decrypted
    // inner file — each artifact is a whole-zip that unpacks into many files, all sharing the
    // artifact's row id (sourceId), so "shared" is keyed on that id.
    const fileRows: UnifiedFileRow[] = useMemo(() => {
        if (decryptedFiles.length > 0) {
            return decryptedFiles.map((f) => ({
                key: `${f.sourceId}-${f.path}`,
                label: logLabel(f.fileType),
                name: f.path,
                bytes: f.contents.byteLength,
                fileType: f.fileType,
                state: sharedIdSet.has(f.sourceId) ? 'approved' : 'decrypted',
                file: f,
            }))
        }
        return encryptedRows.map((f) => ({
            key: `${f.fileType}-${f.id}`,
            label: logLabel(f.fileType),
            name: f.name,
            bytes: null,
            fileType: f.fileType,
            state: sharedIdSet.has(f.id) ? 'approved' : 'locked',
            file: null,
        }))
    }, [encryptedRows, decryptedFiles, sharedIdSet])

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
        isDecrypting,
        form,
        handleSubmit,
        viewingFile,
        openFileViewer: (file: JobFile) => setViewingFile(file),
        closeFileViewer: () => setViewingFile(null),
    }
}
