import { useMutation, useQueryClient } from '@/common'
import { reportMutationError } from '@/components/errors'
import { StudyJobStatus } from '@/database/types'
import { Routes } from '@/lib/routes'
import { JobFileInfo, MinimalJobInfo } from '@/lib/types'
import { approveStudyJobFilesAction, rejectStudyJobFilesAction } from '@/server/actions/study-job.actions'
import type { LatestJobForStudy } from '@/server/db/queries'
import { Button, Group, Text, useMantineTheme } from '@mantine/core'
import { CheckCircleIcon, XCircleIcon } from '@phosphor-icons/react/dist/ssr'
import dayjs from 'dayjs'
import { useParams, useRouter } from 'next/navigation'

export const JobReviewButtons = ({
    job,
    decryptedResults,
}: {
    job: NonNullable<LatestJobForStudy>
    decryptedResults?: JobFileInfo[]
}) => {
    const theme = useMantineTheme()
    const router = useRouter()
    const { orgSlug } = useParams<{ orgSlug: string }>()
    const queryClient = useQueryClient()

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
            queryClient.invalidateQueries({ queryKey: ['org-studies', orgSlug] })
            router.push(Routes.orgDashboard({ orgSlug }))
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
