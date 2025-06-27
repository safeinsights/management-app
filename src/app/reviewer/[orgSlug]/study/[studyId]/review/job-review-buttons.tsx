import { reportMutationError } from '@/components/errors'
import { StudyJobStatus } from '@/database/types'
import { FileEntryWithJobFileInfo, MinimalJobInfo } from '@/lib/types'
import { approveStudyJobFilesAction, rejectStudyJobFilesAction } from '@/server/actions/study-job.actions'
import type { StudyJobWithLastStatus } from '@/server/db/queries'
import { Button, Group, Text, useMantineTheme } from '@mantine/core'
import { CheckCircleIcon, XCircleIcon } from '@phosphor-icons/react/dist/ssr'
import { useMutation } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { useParams, useRouter } from 'next/navigation'

export const JobReviewButtons = ({
    job,
    decryptedResults,
}: {
    job: NonNullable<StudyJobWithLastStatus>
    decryptedResults?: FileEntryWithJobFileInfo[]
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
                await approveStudyJobFilesAction({ orgSlug, jobInfo, jobFiles: decryptedResults })
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
                <CheckCircleIcon weight="fill" size={24} color={theme.colors.green[9]} />
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
                <XCircleIcon weight="fill" size={24} color={theme.colors.red[9]} />
                <Text fz="xs" fw={600} c="red.9">
                    Rejected on {dayjs(rejected.createdAt).format('MMM DD, YYYY')}
                </Text>
            </Group>
        )
    }

    if (!decryptedResults) return null

    return (
        <Group>
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
