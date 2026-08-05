import { useCallback, useRef, useState } from 'react'
import { useQuery } from '@/common'
import { useDecryptFiles } from '@/hooks/use-decrypt-files'
import type { JobFileInfo } from '@/lib/types'
import { fetchEncryptedJobFilesAction } from '@/server/actions/study-job.actions'
import type { LatestJobForStudy } from '@/server/db/queries'
import * as Sentry from '@sentry/nextjs'

const ERRORS = {
    empty: 'Enter your security key to decrypt the outputs.',
    invalid: 'Invalid key. Check that you copied the full key and enter it again.',
    noFiles: 'No encrypted outputs available to decrypt.',
} as const

type UseSecurityKeyFormOptions = {
    job: LatestJobForStudy
    /**
     * Which key set to ask the server for. It cannot be inferred here: this form serves both the
     * reviewer's outputs step (manifest recipient, no wrapped keys) and the researcher reading
     * shared outputs (wrapped keys only), and a dual-role user is legitimately both.
     */
    type: 'researcher' | 'reviewer'
    /**
     * Handed the decrypted plaintext on a successful key. The caller owns it from here: the
     * files carry raw AES keys (see JobFileInfo) and must stay in memory, never persisted.
     */
    onDecrypted: (files: JobFileInfo[]) => void
}

export function useSecurityKeyForm({ job, type, onDecrypted }: UseSecurityKeyFormOptions) {
    const [value, setValue] = useState('')
    const [error, setError] = useState<string>()
    const inputRef = useRef<HTMLTextAreaElement>(null)

    const { data: encryptedFiles, isLoading: isLoadingFiles } = useQuery({
        // The role is part of the key: the action returns a different key set per role, so a
        // dual-role user switching views must not be served the other's cache.
        queryKey: ['encrypted-files', job.id, type],
        queryFn: async () => {
            try {
                return await fetchEncryptedJobFilesAction({ jobId: job.id, type })
            } catch (error) {
                Sentry.captureException(error)
                throw error
            }
        },
    })

    const failInvalid = useCallback(() => {
        setError(ERRORS.invalid)
        requestAnimationFrame(() => inputRef.current?.focus())
    }, [])

    const { decrypt, isPending } = useDecryptFiles({
        encryptedFiles,
        onSuccess: (files) => {
            // A key is only proven by ciphertext it actually opened. useDecryptFiles resolves with
            // [] rather than throwing when it extracts nothing, and its parse step accepts any
            // syntactically valid PEM, so treating that as success would hand the caller an empty
            // set and present it as a reviewed state (OTTER-675).
            if (!files.length) {
                failInvalid()
                return
            }
            setError(undefined)
            onDecrypted(files)
        },
        onError: failInvalid,
    })

    const handleSubmit = useCallback(() => {
        if (isPending) return

        const trimmed = value.trim()
        if (!trimmed) {
            setError(ERRORS.empty)
            inputRef.current?.focus()
            return
        }

        // The button is already disabled while the artifacts load, so this only guards a
        // programmatic call.
        if (isLoadingFiles) return

        // Nothing to test the key against: the query failed, this reviewer has no registered public
        // key, or the job has no encrypted output. None of those is a bad key.
        if (!encryptedFiles?.length) {
            setError(ERRORS.noFiles)
            return
        }

        setError(undefined)
        decrypt(trimmed)
    }, [isPending, isLoadingFiles, encryptedFiles, value, decrypt])

    return {
        value,
        setValue,
        error,
        isDecrypting: isPending,
        isLoadingFiles,
        inputRef,
        handleSubmit,
    }
}
