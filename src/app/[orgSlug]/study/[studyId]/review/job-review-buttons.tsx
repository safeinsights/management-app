'use client'

import { useSession } from '@/hooks/session'
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
    const { session } = useSession()
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

            // Return the action response so the wrapped useMutation can detect ActionFailure
            // (`{ error: ... }`) and route it to onError. Without returning, errors are
            // swallowed inside the async function and the mutation looks like a success.
            if (status === 'FILES-APPROVED') {
                return await approveStudyJobFilesAction({ orgSlug, jobInfo, jobFiles: decryptedResults })
            }

            if (status === 'FILES-REJECTED') {
                return await rejectStudyJobFilesAction(jobInfo)
            }
        },
        onError: (err) => {
            reportMutationError('Failed to update study job status')(err)
            queryClient.invalidateQueries({ queryKey: ['org-studies', orgSlug] })
            queryClient.invalidateQueries({ queryKey: ['study', job.studyId] })
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['org-studies', orgSlug] })
            router.push(Routes.orgDashboard({ orgSlug }))
        },
    })

    // statusChanges is ordered `createdAt desc, id desc` (see src/server/db/queries.ts), so the
    // first terminal status encountered is the latest. Scanning the ordered list (rather than
    // calling find() per status) makes the display deterministic when historical rows on
    // staging happen to contain both FILES-APPROVED and FILES-REJECTED for the same job.
    const latestTerminal = job.statusChanges.find(
        (sc) => sc.status === 'FILES-APPROVED' || sc.status === 'FILES-REJECTED',
    )

    if (latestTerminal?.status === 'FILES-APPROVED') {
        return (
            <Group gap="xs">
                <CheckCircleIcon weight="fill" size={24} color={theme.colors.green[9]} />
                <Text fz="xs" fw={600} c="green.9">
                    Approved on {dayjs(latestTerminal.createdAt).format('MMM DD, YYYY')}
                </Text>
            </Group>
        )
    }

    if (latestTerminal?.status === 'FILES-REJECTED') {
        return (
            <Group gap="xs">
                <XCircleIcon weight="fill" size={24} color={theme.colors.red[9]} />
                <Text fz="xs" fw={600} c="red.9">
                    Rejected on {dayjs(latestTerminal.createdAt).format('MMM DD, YYYY')}
                </Text>
            </Group>
        )
    }

    if (!decryptedResults || !session?.belongsToEnclave) {
        return null
    }

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
                disabled={isPending || isSuccess || !decryptedResults?.length}
                loading={isPending && pendingStatus == 'FILES-APPROVED'}
                onClick={() => updateStudyJob({ status: 'FILES-APPROVED' })}
            >
                Approve
            </Button>
        </Group>
    )
}
