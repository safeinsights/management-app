import { useCallback, useRef, useState } from 'react'
import { useQuery } from '@/common'
import { useDecryptFiles } from '@/hooks/use-decrypt-files'
import { fetchEncryptedJobFilesAction } from '@/server/actions/study-job.actions'
import type { LatestJobForStudy } from '@/server/db/queries'
import * as Sentry from '@sentry/nextjs'

const ERRORS = {
    empty: 'Enter your security key to decrypt the outputs.',
    invalid: 'Invalid key. Check that you copied the full key and enter it again.',
    noFiles: 'No encrypted outputs available to decrypt.',
} as const

const SUCCESS_MESSAGE = 'Security key accepted.'

export function useSecurityKeyForm({ job }: { job: LatestJobForStudy }) {
    const [value, setValue] = useState('')
    const [error, setError] = useState<string>()
    const [successMessage, setSuccessMessage] = useState<string>()
    const inputRef = useRef<HTMLTextAreaElement>(null)

    const { data: encryptedFiles, isLoading: isLoadingFiles } = useQuery({
        queryKey: ['encrypted-files', job.id],
        queryFn: async () => {
            try {
                return await fetchEncryptedJobFilesAction({ jobId: job.id })
            } catch (error) {
                Sentry.captureException(error)
                throw error
            }
        },
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

        if (!encryptedFiles?.length) {
            setError(ERRORS.noFiles)
            setSuccessMessage(undefined)
            return
        }

        setError(undefined)
        setSuccessMessage(undefined)
        decrypt(trimmed)
    }, [isPending, isLoadingFiles, encryptedFiles, value, decrypt])

    return {
        value,
        setValue,
        error,
        successMessage,
        isDecrypting: isPending,
        isLoadingFiles,
        inputRef,
        handleSubmit,
    }
}
