import { StudyJob } from '@/schema/study'
import { Button, Group, Text } from '@mantine/core'
import React from 'react'
import { StudyJobStatus } from '@/database/types'
import { useMutation, useQuery } from '@tanstack/react-query'
import { MinimalJobInfo } from '@/lib/types'
import { useRouter } from 'next/navigation'
import {
    approveStudyJobResultsAction,
    loadStudyJobAction,
    rejectStudyJobResultsAction,
} from '@/server/actions/study-job.actions'
import { CheckCircle, XCircle } from '@phosphor-icons/react/dist/ssr'
import dayjs from 'dayjs'

type FileEntry = {
    path: string
    contents: ArrayBuffer
}

export const JobReviewButtons = ({ job, decryptedResults }: { job: StudyJob; decryptedResults: FileEntry[] }) => {
    const router = useRouter()

    const jobInfo = useQuery({
        queryKey: ['jobInfo', job.id],
        queryFn: () => {
            return loadStudyJobAction(job.id)
        },
    }).data?.jobInfo

    const { mutate: updateStudyJob } = useMutation({
        mutationFn: async ({ jobInfo, status }: { jobInfo: MinimalJobInfo; status: StudyJobStatus }) => {
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
    if (!jobInfo) return null

    if (jobInfo.jobStatus === 'RESULTS-APPROVED') {
        return (
            <Group c="#12B886" gap="0">
                <CheckCircle weight="fill" />
                <Text>Approved on {dayjs(jobInfo.jobStatusCreatedAt).format('MMM DD, YYYY')}</Text>
            </Group>
        )
    }

    if (jobInfo.jobStatus === 'RESULTS-REJECTED') {
        return (
            <Group c="#FA5252" gap="0">
                <XCircle weight="fill" />
                <Text>Rejected on {dayjs(jobInfo.jobStatusCreatedAt).format('MMM DD, YYYY')}</Text>
            </Group>
        )
    }

    return (
        <Group>
            <Button onClick={() => updateStudyJob({ jobInfo: jobInfo, status: 'RESULTS-REJECTED' })} variant="outline">
                Reject
            </Button>
            <Button onClick={() => updateStudyJob({ jobInfo: jobInfo, status: 'RESULTS-APPROVED' })}>Approve</Button>
        </Group>
    )
}
