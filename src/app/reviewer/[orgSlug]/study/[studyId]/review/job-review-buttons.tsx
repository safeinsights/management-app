import { DownloadLink } from '@/components/links'
import { StudyJobStatus } from '@/database/types'
import { MinimalJobInfo } from '@/lib/types'
import { approveStudyJobResultsAction, rejectStudyJobResultsAction } from '@/server/actions/study-job.actions'
import type { StudyJobWithLastStatus } from '@/server/db/queries'
import { Button, Divider, Group, Text, useMantineTheme } from '@mantine/core'
import { CheckCircle, XCircle } from '@phosphor-icons/react/dist/ssr'
import { useMutation } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { useParams, useRouter } from 'next/navigation'

type FileEntry = {
    path: string
    contents: ArrayBuffer
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

            if (status === 'RESULTS-APPROVED') {
                await approveStudyJobResultsAction({ orgSlug, jobInfo, jobResults: decryptedResults })
            }

            if (status === 'RESULTS-REJECTED') {
                await rejectStudyJobResultsAction(jobInfo)
            }
        },
        onSuccess: () => {
            router.push('/')
        },
    })

    //TODO: Revist the implementation of this null check
    // if (!decryptedResults?.length) return null

    if (job.latestStatus === 'RESULTS-APPROVED') {
        return (
            <Group gap="2">
                <CheckCircle weight="fill" size={24} color={theme.colors.green[9]} />
                <Text fz="xs" fw={600} c="green.9">
                    Approved on {dayjs(job.latestStatusChangeOccurredAt).format('MMM DD, YYYY')}
                </Text>
            </Group>
        )
    }

    if (job.latestStatus === 'RESULTS-REJECTED') {
        return (
            <Group gap="2">
                <XCircle weight="fill" size={24} color={theme.colors.red[9]} />
                <Text fz="xs" fw={600} c="red.9">
                    Rejected on {dayjs(job.latestStatusChangeOccurredAt).format('MMM DD, YYYY')}
                </Text>
            </Group>
        )
    }

    return (
        <Group>
            <Divider />
            <DownloadLink target="_blank" filename={decryptedResults[0].path} content={decryptedResults[0].contents} />
            <Divider />
            <Button
                disabled={isPending || isSuccess}
                loading={isPending && pendingStatus == 'RESULTS-REJECTED'}
                onClick={() => updateStudyJob({ status: 'RESULTS-REJECTED' })}
                variant="outline"
            >
                Reject
            </Button>
            <Button
                disabled={isPending || isSuccess}
                loading={isPending && pendingStatus == 'RESULTS-APPROVED'}
                onClick={() => updateStudyJob({ status: 'RESULTS-APPROVED' })}
            >
                Approve
            </Button>
        </Group>
    )
}
