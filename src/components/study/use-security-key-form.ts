import { useCallback, useRef, useState } from 'react'
import { useQuery } from '@/common'
import { useDecryptFiles } from '@/hooks/use-decrypt-files'
import { fetchEncryptedJobFilesAction } from '@/server/actions/study-job.actions'
import type { LatestJobForStudy } from '@/server/db/queries'

const ERRORS = {
    empty: 'Enter your security key to decrypt the outputs.',
    invalid: 'Invalid key. Check that you copied the full key and enter it again.',
} as const

const SUCCESS_MESSAGE = 'Security key accepted.'

export function useSecurityKeyForm({ job }: { job: LatestJobForStudy }) {
    const [value, setValue] = useState('')
    const [error, setError] = useState<string>()
    const [successMessage, setSuccessMessage] = useState<string>()
    const inputRef = useRef<HTMLTextAreaElement>(null)

    const { data: encryptedFiles, isLoading: isLoadingFiles } = useQuery({
        queryKey: ['encrypted-files', job.id],
        queryFn: () => fetchEncryptedJobFilesAction({ jobId: job.id }),
    })

    const { decrypt, isPending } = useDecryptFiles({
        encryptedFiles,
        onSuccess: () => {
            setError(undefined)
            setSuccessMessage(SUCCESS_MESSAGE)
        },
        onError: () => {
            setError(ERRORS.invalid)
            setSuccessMessage(undefined)
            requestAnimationFrame(() => inputRef.current?.focus())
        },
    })

    const handleSubmit = useCallback(() => {
        if (isPending) return

        const trimmed = value.trim()
        if (!trimmed) {
            setError(ERRORS.empty)
            setSuccessMessage(undefined)
            inputRef.current?.focus()
            return
        }

        if (isLoadingFiles) return

        setError(undefined)
        setSuccessMessage(undefined)
        decrypt(trimmed)
    }, [isPending, isLoadingFiles, value, decrypt])

    return {
        value,
        setValue,
        error,
        successMessage,
        isDecrypting: isPending,
        inputRef,
        handleSubmit,
    }
}
