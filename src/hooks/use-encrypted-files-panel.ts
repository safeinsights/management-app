import { useQuery } from '@/common'
import { useDecryptFiles } from '@/hooks/use-decrypt-files'
import { isEncryptedArtifact, logLabel } from '@/lib/file-type-helpers'
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
    // Reviewers are manifest recipients and see every artifact (and a job-wide "shared with lab"
    // indicator). Researchers see only artifacts they hold a wrapped key for, so row visibility and
    // state are driven off their own decryptable set, not the job-wide one.
    isReviewer: boolean
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

export function useEncryptedFilesPanel({ job, onFilesApproved, isReviewer }: Options) {
    const [decryptedFiles, setDecryptedFiles] = useState<JobFileInfo[]>([])
    const [viewingFile, setViewingFile] = useState<JobFile | null>(null)

    const isJobApproved = (job.statusChanges ?? []).some((sc) => sc.status === 'FILES-APPROVED')

    // Which artifacts are shared with researchers, derived from the re-wrapped key rows.
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

    // All-or-nothing: approving shares the whole decrypted package (results AND logs). Each
    // artifact carries its own rawAesKey, so buildSharedFiles re-wraps each for the lab keys.
    useEffect(() => {
        onFilesApproved(decryptedFiles)
    }, [decryptedFiles]) // eslint-disable-line react-hooks/exhaustive-deps

    const encryptedRows = useMemo(() => (job.files ?? []).filter((f) => isEncryptedArtifact(f.fileType)), [job.files])

    // A researcher's accessible set = artifacts they hold a wrapped key for (what the action
    // returns). Reviewers can decrypt every artifact, so theirs is all encrypted rows.
    const accessibleIdSet = useMemo(
        () => new Set((encryptedFiles ?? []).map((f) => f.studyJobFileId)),
        [encryptedFiles],
    )
    const visibleRows = useMemo(
        () => (isReviewer ? encryptedRows : encryptedRows.filter((f) => accessibleIdSet.has(f.id))),
        [isReviewer, encryptedRows, accessibleIdSet],
    )

    // Gate the decrypt form on what THIS user can actually decrypt: a researcher with no wrapped
    // keys (e.g. late joiner, pre-renewal) has nothing to decrypt, so don't show a form to nowhere.
    const accessibleCount = isReviewer ? encryptedRows.length : (encryptedFiles?.length ?? 0)
    const shouldShowForm = accessibleCount > 0 && decryptedFiles.length === 0

    const sharedIdSet = useMemo(() => new Set(sharedFileIds), [sharedFileIds])

    // Before decryption: one locked row per encrypted artifact (size unknown until decrypted).
    // After: one row per inner file, all sharing the artifact's row id (sourceId) that "shared" is
    // keyed on. The green "shared" state is a reviewer-facing signal (job-wide sharedFileIds = "I've
    // shared this with the lab"); a researcher only ever sees rows they can already decrypt.
    const fileRows: UnifiedFileRow[] = useMemo(() => {
        if (decryptedFiles.length > 0) {
            return decryptedFiles.map((f) => ({
                key: `${f.sourceId}-${f.path}`,
                label: logLabel(f.fileType),
                name: f.path,
                bytes: f.contents.byteLength,
                fileType: f.fileType,
                state: isReviewer && sharedIdSet.has(f.sourceId) ? 'approved' : 'decrypted',
                file: f,
            }))
        }
        return visibleRows.map((f) => ({
            key: `${f.fileType}-${f.id}`,
            label: logLabel(f.fileType),
            name: f.name,
            bytes: null,
            fileType: f.fileType,
            state: isReviewer && sharedIdSet.has(f.id) ? 'approved' : 'locked',
            file: null,
        }))
    }, [visibleRows, decryptedFiles, sharedIdSet, isReviewer])

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
