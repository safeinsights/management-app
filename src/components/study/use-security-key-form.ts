import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@/common'
import { useDecryptFiles } from '@/hooks/use-decrypt-files'
import type { JobFileInfo } from '@/lib/types'
import { fetchEncryptedJobFilesAction } from '@/server/actions/study-job.actions'
import * as Sentry from '@sentry/nextjs'

const ERRORS = {
    empty: 'Enter your security key to decrypt the outputs.',
    invalid: 'Invalid key. Check that you copied the full key and enter it again.',
    noFiles: 'No encrypted outputs available to decrypt.',
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
}

export function useSecurityKeyForm({ job, type, onDecrypted }: UseSecurityKeyFormOptions) {
    const [value, setValue] = useState('')
    const [error, setError] = useState<string>()
    const inputRef = useRef<HTMLTextAreaElement>(null)

    const {
        data: encryptedFiles,
        isLoading: isLoadingFiles,
        isSuccess: isFileListLoaded,
    } = useQuery({
        // Role is part of the key so a dual-role user is not served the other role's cache.
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

    const failInvalid = useCallback(() => setError(ERRORS.invalid), [])

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
        /**
         * The server answered, and this researcher holds no wrapped key for the job (OTTER-688).
         *
         * Role-resolved here rather than by the caller (PR #1003 review): an empty result means
         * different things per role, so the flag would otherwise only acquire its meaning once
         * recombined with `type` at the call site, splitting one contract across two files. The
         * researcher branch of fetchEncryptedJobFilesAction filters to artifacts wrapped for THEIR
         * fingerprint, so empty means they hold no key; the reviewer branch returns every encrypted
         * artifact regardless of keys, so empty means the job produced nothing — a different state,
         * handled elsewhere (OTTER-524), which this flag must never claim.
         *
         * Gated on isSuccess, not on a falsy length: queryFn re-throws after the Sentry capture, so a
         * FAILED fetch leaves data undefined — and reporting that as "you hold no key" would blame the
         * user's key for an outage. This is the distinction fetchEncryptedJobFilesAction's empty
         * return conflates (no artifacts / no wrapped key for the caller / fetch failed), and the one
         * the legacy gate in use-encrypted-files-panel misses with `encryptedFiles?.length ?? 0`.
         */
        hasNoWrappedKey: type === 'researcher' && isFileListLoaded && encryptedFiles?.length === 0,
    }
}
