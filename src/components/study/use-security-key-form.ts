import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient, useTanStackQuery } from '@/common'
import {
    ARCHIVE_INTEGRITY_MESSAGE,
    ArchiveIntegrityError,
    fingerprintOfPrivateKey,
    useDecryptFiles,
} from '@/hooks/use-decrypt-files'
import type { JobFileInfo } from '@/lib/types'
import { actionResult } from '@/lib/utils'
import { fetchEncryptedJobFilesAction } from '@/server/actions/study-job.actions'
import * as Sentry from '@sentry/nextjs'
import { queryKeys } from '@/lib/query-keys'

export const SECURITY_KEY_ERRORS = {
    empty: 'Enter your security key to decrypt the outputs.',
    invalid: 'Invalid key. Check that you copied the full key and enter it again.',
    noFiles: 'No encrypted outputs available to decrypt.',
    integrity: ARCHIVE_INTEGRITY_MESSAGE,
    fetchFailed: 'The outputs could not be loaded. Refresh the page to try again.',
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
export const encryptedFilesQuery = (jobId: string, type: 'researcher' | 'reviewer', fingerprint?: string) => ({
    queryKey: queryKeys.jobEncryptedFiles(jobId, type, fingerprint),
    queryFn: async () => {
        const response = await fetchEncryptedJobFilesAction({ jobId, type, fingerprint }).catch((error: unknown) => {
            Sentry.captureException(error)
            throw error
        })
        return actionResult(response)
    },
})

// A failed fetch says nothing about the key, so it must not read as "Invalid key".
class EncryptedFilesFetchError extends Error {}

// A run shared before the researcher replaced their key is wrapped only for the old key, so the
// wraps are asked for by the fingerprint of the key entered, not the key on file.
export async function fetchResearcherEncryptedFiles(
    queryClient: ReturnType<typeof useQueryClient>,
    jobId: string,
    privateKey: string,
) {
    const fingerprint = await fingerprintOfPrivateKey(privateKey)
    try {
        return await queryClient.fetchQuery(encryptedFilesQuery(jobId, 'researcher', fingerprint))
    } catch (err) {
        throw new EncryptedFilesFetchError('The encrypted outputs could not be loaded', { cause: err })
    }
}

const decryptErrorMessage = (err: Error) => {
    if (err instanceof ArchiveIntegrityError) return SECURITY_KEY_ERRORS.integrity
    if (err instanceof EncryptedFilesFetchError) return SECURITY_KEY_ERRORS.noFiles
    return SECURITY_KEY_ERRORS.invalid
}

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
    const queryClient = useQueryClient()
    const isResearcher = type === 'researcher'

    // A researcher's archives depend on the key entered, so they are fetched on submit instead.
    const { data: encryptedFiles, isLoading: isLoadingFiles } = useTanStackQuery({
        ...encryptedFilesQuery(job.id, type),
        enabled: !isResearcher,
    })

    const failInvalid = useCallback(() => setError(SECURITY_KEY_ERRORS.invalid), [])

    const failDecrypt = useCallback((err: Error) => setError(decryptErrorMessage(err)), [])

    const { decrypt, isPending } = useDecryptFiles({
        encryptedFiles,
        loadEncryptedFiles: isResearcher
            ? (privateKey) => fetchResearcherEncryptedFiles(queryClient, job.id, privateKey)
            : undefined,
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
            setError(SECURITY_KEY_ERRORS.empty)
            inputRef.current?.focus()
            return
        }

        // The button is already disabled while the artifacts load, so this only guards a
        // programmatic call.
        if (isLoadingFiles) return

        // A reviewer's empty answer, or a failed fetch, is not a bad key. A researcher's empty answer
        // is: it holds only the wraps for the key entered, and decrypting nothing fails as invalid.
        if (!isResearcher && !encryptedFiles?.length) {
            setError(SECURITY_KEY_ERRORS.noFiles)
            return
        }

        setError(undefined)
        decrypt(trimmed)
    }, [isPending, isLoadingFiles, isResearcher, encryptedFiles, value, decrypt])

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
