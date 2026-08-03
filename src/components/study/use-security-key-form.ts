import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@/common'
import { useDecryptFiles } from '@/hooks/use-decrypt-files'
import type { JobFileInfo } from '@/lib/types'
import { fetchEncryptedJobFilesAction } from '@/server/actions/study-job.actions'
import type { LatestJobForStudy } from '@/server/db/queries'

const ERRORS = {
    empty: 'Enter your security key to decrypt the outputs.',
    invalid: 'Invalid key. Check that you copied the full key and enter it again.',
    unavailable: 'These outputs are not available to decrypt. Contact your organization admin.',
} as const

type UseSecurityKeyFormOptions = {
    job: LatestJobForStudy
    /**
     * Handed the decrypted plaintext on a successful key. The caller owns it from here — the
     * files carry raw AES keys (see JobFileInfo) and must stay in memory, never persisted.
     */
    onDecrypted: (files: JobFileInfo[]) => void
}

export function useSecurityKeyForm({ job, onDecrypted }: UseSecurityKeyFormOptions) {
    const [value, setValue] = useState('')
    const [error, setError] = useState<string>()
    const inputRef = useRef<HTMLTextAreaElement>(null)
    // A key submitted while the artifact fetch was still in flight, replayed once it settles.
    const pendingKeyRef = useRef<string | null>(null)

    const { data: encryptedFiles, isLoading: isLoadingFiles } = useQuery({
        queryKey: ['encrypted-files', job.id],
        queryFn: () => fetchEncryptedJobFilesAction({ jobId: job.id }),
    })

    const failInvalid = useCallback(() => {
        setError(ERRORS.invalid)
        requestAnimationFrame(() => inputRef.current?.focus())
    }, [])

    const { decrypt, isPending } = useDecryptFiles({
        encryptedFiles,
        onSuccess: (files) => {
            // A key is only proven by ciphertext it actually opened. useDecryptFiles resolves with
            // [] when there is nothing to decrypt, and its parse step accepts any syntactically
            // valid PEM, so treating that as success would unlock the review view for any
            // well-formed key and present an empty table as a reviewed state.
            if (!files.length) {
                failInvalid()
                return
            }
            setError(undefined)
            onDecrypted(files)
        },
        onError: failInvalid,
    })

    const submit = useCallback(
        (rawKey: string) => {
            // No artifacts to test the key against: either the query failed, this reviewer has no
            // registered public key, or the job has no encrypted output. None of those is a bad
            // key, so say so rather than reporting the key as invalid.
            if (!encryptedFiles?.length) {
                setError(ERRORS.unavailable)
                inputRef.current?.focus()
                return
            }

            setError(undefined)
            decrypt(rawKey)
        },
        [encryptedFiles, decrypt],
    )

    const handleSubmit = useCallback(() => {
        if (isPending) return

        const trimmed = value.trim()
        if (!trimmed) {
            setError(ERRORS.empty)
            inputRef.current?.focus()
            return
        }

        // The artifact fetch starts on mount and normally finishes long before a PEM key has been
        // pasted, but a click that lands first must not be dropped: remember it and let the effect
        // below run it once the fetch settles. The button stays enabled either way (OTTER-667).
        if (isLoadingFiles) {
            pendingKeyRef.current = trimmed
            return
        }

        submit(trimmed)
    }, [isPending, isLoadingFiles, value, submit])

    useEffect(() => {
        if (isLoadingFiles) return
        const queued = pendingKeyRef.current
        if (!queued) return
        pendingKeyRef.current = null
        submit(queued)
    }, [isLoadingFiles, submit])

    return {
        value,
        setValue,
        error,
        isDecrypting: isPending,
        inputRef,
        handleSubmit,
    }
}
