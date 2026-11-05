import { useCallback, useEffect, useRef, useState } from 'react'
import { useTanStackQuery } from '@/common'
import { ARCHIVE_INTEGRITY_MESSAGE, ArchiveIntegrityError, useDecryptFiles } from '@/hooks/use-decrypt-files'
import type { JobFileInfo } from '@/lib/types'
import { actionResult } from '@/lib/utils'
import { fetchEncryptedJobFilesAction } from '@/server/actions/study-job.actions'
import * as Sentry from '@sentry/nextjs'

const ERRORS = {
    empty: 'Enter your security key to decrypt the outputs.',
    invalid: 'Invalid key. Check that you copied the full key and enter it again.',
    noFiles: 'No encrypted outputs available to decrypt.',
    integrity: ARCHIVE_INTEGRITY_MESSAGE,
} as const

type UseSecurityKeyFormOptions = {
    /** Only the id is read (it keys the encrypted-files fetch), so callers need not load a full job row. */
    job: { id: string }
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
    /** Handed the key that opened this job, so earlier runs can be tried with it while it is in
     * hand. Callers must not keep it. */
    onKeyAccepted?: (privateKey: string) => void
    /** Lets the caller hold the typed key, for a form that unmounts while its text must survive. */
    value?: string
    onValueChange?: (value: string) => void
}

// Shared with the code run history's up-front decrypt, so a row and its own key form read one
// cache entry rather than each downloading the archives.
export const encryptedFilesQuery = (jobId: string, type: 'researcher' | 'reviewer') => ({
    // Role is part of the key so a dual-role user is not served the other role's cache.
    queryKey: ['encrypted-files', jobId, type],
    queryFn: async () => {
        const response = await fetchEncryptedJobFilesAction({ jobId, type }).catch((error: unknown) => {
            Sentry.captureException(error)
            throw error
        })
        return actionResult(response)
    },
})

export function useSecurityKeyForm({
    job,
    type,
    onDecrypted,
    onKeyAccepted,
    value: heldValue,
    onValueChange,
}: UseSecurityKeyFormOptions) {
    const [ownValue, setOwnValue] = useState('')
    const value = heldValue ?? ownValue
    const setValue = onValueChange ?? setOwnValue
    const [error, setError] = useState<string>()
    const inputRef = useRef<HTMLTextAreaElement>(null)

    const {
        data: encryptedFiles,
        isLoading: isLoadingFiles,
        isSuccess,
    } = useTanStackQuery(encryptedFilesQuery(job.id, type))

    const failInvalid = useCallback(() => setError(ERRORS.invalid), [])

    const failDecrypt = useCallback(
        (err: Error) => setError(err instanceof ArchiveIntegrityError ? ERRORS.integrity : ERRORS.invalid),
        [],
    )

    const { decrypt, isPending } = useDecryptFiles({
        encryptedFiles,
        jobId: job.id,
        onSuccess: (files, privateKey) => {
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
            onKeyAccepted?.(privateKey)
        },
        onError: failDecrypt,
    })

    useEffect(() => {
        if (error && !isPending) {
            inputRef.current?.focus()
        }
    }, [error, isPending])

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

        // A researcher is only sent outputs wrapped for their registered key, so an empty answer
        // means no key they hold opens them. A failed fetch, or a reviewer's empty answer, is not a bad key.
        if (!encryptedFiles?.length) {
            setError(type === 'researcher' && isSuccess ? ERRORS.invalid : ERRORS.noFiles)
            return
        }

        setError(undefined)
        decrypt(trimmed)
    }, [isPending, isLoadingFiles, encryptedFiles, isSuccess, type, value, decrypt])

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
