import { ViewFile } from '@/components/job-results'
import { useDecryptFiles } from '@/hooks/use-decrypt-files'
import { useJobStatus } from '@/hooks/use-job-results-status'
import { isEncryptedLogType } from '@/lib/file-type-helpers'
import { JobFileInfo } from '@/lib/types'
import { fetchEncryptedJobFilesAction } from '@/server/actions/study-job.actions'
import type { LatestJobForStudy } from '@/server/db/queries'
import { Button, Group, Stack, Textarea } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import * as Sentry from '@sentry/nextjs'
import { useQuery } from '@/common'
import { useParams } from 'next/navigation'
import { FC, useState } from 'react'

type Props = {
    job: NonNullable<LatestJobForStudy>
    onApproval: (decryptedResults: JobFileInfo[]) => void
}

export const DecryptResults: FC<Props> = ({ job, onApproval }) => {
    const [decryptedFiles, setDecryptedFiles] = useState<JobFileInfo[]>([])
    const { orgSlug } = useParams<{ orgSlug: string }>()
    const { isApproved, isComplete, isErrored } = useJobStatus(job.statusChanges)

    const { isLoading: isLoadingBlob, data: encryptedFiles } = useQuery({
        queryKey: ['study-job', job.id],
        queryFn: async () => {
            try {
                return await fetchEncryptedJobFilesAction({ jobId: job.id, orgSlug })
            } catch (error) {
                Sentry.captureException(error)
                form.setFieldError('privateKey', 'Failed to fetch results, please try again later.')
                throw error
            }
        },
        enabled: isComplete || isErrored,
    })

    const {
        decrypt: decryptResults,
        isPending: isDecrypting,
        form,
    } = useDecryptFiles({
        encryptedFiles,
        onSuccess: (files) => {
            onApproval(files)
            setDecryptedFiles(files)
        },
    })

    const handleError = (errors: typeof form.errors) => {
        if (errors.privateKey) {
            notifications.show({ message: 'Invalid private key', color: 'red' })
        }
    }

    if (isApproved) return null

    // If errored but no encrypted logs available, don't render decryption form here - missing logs message is shown on the main results page
    const hasEncryptedLogs = job.files?.some((f) => isEncryptedLogType(f.fileType)) ?? false
    if (isErrored && !hasEncryptedLogs) return null

    return (
        <Stack>
            {decryptedFiles.map((decryptedFile) => (
                <ViewFile file={decryptedFile} key={decryptedFile.path} />
            ))}
            {(isComplete || isErrored) && !decryptedFiles?.length && (
                <form onSubmit={form.onSubmit((values) => decryptResults(values.privateKey), handleError)}>
                    <Stack>
                        <Textarea
                            label="Enter Reviewer Key"
                            resize="vertical"
                            {...form.getInputProps('privateKey')}
                            placeholder="Enter your Reviewer key to access encrypted content."
                            key={form.key('privateKey')}
                        />
                        <Group>
                            <Button type="submit" disabled={!form.isValid() || isLoadingBlob} loading={isDecrypting}>
                                View Results
                            </Button>
                        </Group>
                    </Stack>
                </form>
            )}
        </Stack>
    )
}
