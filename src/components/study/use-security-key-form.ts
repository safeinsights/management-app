import { useCallback, useRef, useState } from 'react'
import { useQuery } from '@/common'
import { useDecryptFiles } from '@/hooks/use-decrypt-files'
import type { JobFileInfo } from '@/lib/types'
import { fetchEncryptedJobFilesAction } from '@/server/actions/study-job.actions'
import type { LatestJobForStudy } from '@/server/db/queries'

const ERRORS = {
    empty: 'Enter your security key to decrypt the outputs.',
    invalid: 'Invalid key. Check that you copied the full key and enter it again.',
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

    const { data: encryptedFiles, isLoading: isLoadingFiles } = useQuery({
        queryKey: ['encrypted-files', job.id],
        queryFn: () => fetchEncryptedJobFilesAction({ jobId: job.id }),
    })

    const { decrypt, isPending } = useDecryptFiles({
        encryptedFiles,
        onSuccess: (files) => {
            setError(undefined)
            onDecrypted(files)
        },
        onError: () => {
            setError(ERRORS.invalid)
            requestAnimationFrame(() => inputRef.current?.focus())
        },
    })

    const handleSubmit = useCallback(() => {
        if (isPending) return

        const trimmed = value.trim()
        if (!trimmed) {
            setError(ERRORS.empty)
            inputRef.current?.focus()
            return
        }

        if (isLoadingFiles) return

        setError(undefined)
        decrypt(trimmed)
    }, [isPending, isLoadingFiles, value, decrypt])

    return {
        value,
        setValue,
        error,
        isDecrypting: isPending,
        inputRef,
        handleSubmit,
    }
}
