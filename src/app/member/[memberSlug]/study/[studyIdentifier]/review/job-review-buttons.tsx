import { DownloadLink } from '@/components/links'
import { StudyJobStatus } from '@/database/types'
import { MinimalJobInfo } from '@/lib/types'
import { approveStudyJobResultsAction, rejectStudyJobResultsAction } from '@/server/actions/study-job.actions'
import type { StudyJobWithLastStatus } from '@/server/db/queries'
import { Button, Divider, Group, Text } from '@mantine/core'
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
    const router = useRouter()
    const { memberSlug } = useParams<{ memberSlug: string }>()

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
                memberSlug,
            }

            if (status === 'RESULTS-APPROVED') {
                await approveStudyJobResultsAction({ jobInfo, jobResults: decryptedResults })
            }

            if (status === 'RESULTS-REJECTED') {
                await rejectStudyJobResultsAction(jobInfo)
            }
        },
        onSuccess: () => {
            router.push('/')
        },
    })

    if (job.latestStatus === 'RESULTS-APPROVED') {
        return (
            <Group c="#12B886" gap="0">
                <CheckCircle weight="fill" />
                <Text>Approved on {dayjs(job.latestStatusChangeOccuredAt).format('MMM DD, YYYY')}</Text>
            </Group>
        )
    }

    if (job.latestStatus === 'RESULTS-REJECTED') {
        return (
            <Group c="#FA5252" gap="0">
                <XCircle weight="fill" />
                <Text>Rejected on {dayjs(job.latestStatusChangeOccuredAt).format('MMM DD, YYYY')}</Text>
            </Group>
        )
    }

    return (
        <Group>
            <Divider />
            {decryptedResults?.length && (
                <DownloadLink
                    target="_blank"
                    filename={decryptedResults[0].path}
                    content={decryptedResults[0].contents}
                />
            )}
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
