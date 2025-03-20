import { StudyJob } from '@/schema/study'
import { Button, Group } from '@mantine/core'
import React from 'react'
import { StudyJobStatus } from '@/database/types'
import { useMutation, useQuery } from '@tanstack/react-query'
import { MinimalJobInfo } from '@/lib/types'
import { useRouter } from 'next/navigation'
import { dataForJobAction, updateStudyJobStatusAction } from '@/server/actions/study-job-actions'

export const JobReviewButtons = ({ job, decryptedResults }: { job: StudyJob; decryptedResults: string[] }) => {
    const router = useRouter()
    const jobInfo = useQuery({
        queryKey: ['jobInfo', job.id],
        queryFn: () => {
            return dataForJobAction(job.id)
        },
    }).data?.jobInfo

    const { mutate: updateStudyJob } = useMutation({
        mutationFn: async ({ jobInfo, status }: { jobInfo: MinimalJobInfo; status: StudyJobStatus }) => {
            if (status === 'RESULTS-APPROVED') {
                await updateStudyJobStatusAction(jobInfo, status, decryptedResults)
            }

            if (status === 'RESULTS-REJECTED') {
                await updateStudyJobStatusAction(jobInfo, status)
            }
        },
        onSuccess: () => {
            router.push('/')
        },
    })

    if (!jobInfo) return null

    // TODO Add job approvedAt/rejectedAt fields
    //  and render appropriately if they exist
    return (
        <Group>
            <Button
                color="#291BC4"
                onClick={() => updateStudyJob({ jobInfo: jobInfo, status: 'RESULTS-REJECTED' })}
                variant="outline"
            >
                Reject
            </Button>
            <Button color="#291BC4" onClick={() => updateStudyJob({ jobInfo: jobInfo, status: 'RESULTS-APPROVED' })}>
                Approve
            </Button>
        </Group>
    )
}
