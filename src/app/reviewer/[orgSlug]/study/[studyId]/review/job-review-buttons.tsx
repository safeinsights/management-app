import { DownloadResultsLink } from '@/components/links'
import { reportMutationError } from '@/components/errors'
import { StudyJobStatus } from '@/database/types'
import { MinimalJobInfo } from '@/lib/types'
import {
    approveStudyJobLogsAction,
    approveStudyJobResultsAction,
    rejectStudyJobFilesAction,
} from '@/server/actions/study-job.actions'
import type { StudyJobWithLastStatus } from '@/server/db/queries'
import { Button, Divider, Group, Text, useMantineTheme } from '@mantine/core'
import { CheckCircle, XCircle } from '@phosphor-icons/react/dist/ssr'
import { useMutation } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { useParams, useRouter } from 'next/navigation'
import { FC } from 'react'

type FileEntry = {
    path: string
    contents: ArrayBuffer
}

const DownloadResults: FC<{ results?: FileEntry }> = ({ results }) => {
    if (!results) return null
    return (
        <>
            <Divider />
            <DownloadResultsLink target="_blank" filename={results.path} content={results.contents} />
            <Divider />
        </>
    )
}

export const JobReviewButtons = ({
    job,
    decryptedResults,
}: {
    job: NonNullable<StudyJobWithLastStatus>
    decryptedResults?: FileEntry[]
}) => {
    const theme = useMantineTheme()
    const router = useRouter()
    const { orgSlug } = useParams<{ orgSlug: string }>()

    const {
        mutate: updateStudyJob,
        isPending,
        isSuccess,
        variables: { status: pendingStatus } = {},
    } = useMutation({
        mutationFn: async ({ status }: { status: StudyJobStatus }) => {
            if (!decryptedResults?.length) return

            const jobInfo: MinimalJobInfo = {
                studyId: job.studyId,
                studyJobId: job.id,
                orgSlug: orgSlug,
            }

            if (status === 'FILES-APPROVED') {
                // Eventually we might support multiple files, so this logic will have to change with that
                const isLogFile = job.files.some((file) => file.fileType === 'ENCRYPTED-LOG')

                if (!isLogFile) {
                    await approveStudyJobResultsAction({ orgSlug, jobInfo, jobFiles: decryptedResults })
                }

                await approveStudyJobLogsAction({ orgSlug, jobInfo, jobFiles: decryptedResults })
            }

            if (status === 'FILES-REJECTED') {
                await rejectStudyJobFilesAction(jobInfo)
            }
        },
        onError: reportMutationError('Failed to update study job status'),
        onSuccess: () => {
            router.push('/')
        },
    })

    const approved = job.statusChanges.find((sc) => sc.status == 'FILES-APPROVED')
    if (approved) {
        return (
            <Group gap="xs">
                <CheckCircle weight="fill" size={24} color={theme.colors.green[9]} />
                <Text fz="xs" fw={600} c="green.9">
                    Approved on {dayjs(approved.createdAt).format('MMM DD, YYYY')}
                </Text>
            </Group>
        )
    }

    const rejected = job.statusChanges.find((sc) => sc.status == 'FILES-REJECTED')
    if (rejected) {
        return (
            <Group gap="xs">
                <XCircle weight="fill" size={24} color={theme.colors.red[9]} />
                <Text fz="xs" fw={600} c="red.9">
                    Rejected on {dayjs(rejected.createdAt).format('MMM DD, YYYY')}
                </Text>
            </Group>
        )
    }

    if (!decryptedResults) return null

    return (
        <Group>
            <DownloadResults results={decryptedResults[0]} />
            <Button
                disabled={isPending || isSuccess}
                loading={isPending && pendingStatus == 'FILES-REJECTED'}
                onClick={() => updateStudyJob({ status: 'FILES-REJECTED' })}
                variant="outline"
            >
                Reject
            </Button>
            <Button
                disabled={isPending || isSuccess}
                loading={isPending && pendingStatus == 'FILES-APPROVED'}
                onClick={() => updateStudyJob({ status: 'FILES-APPROVED' })}
            >
                Approve
            </Button>
        </Group>
    )
}
