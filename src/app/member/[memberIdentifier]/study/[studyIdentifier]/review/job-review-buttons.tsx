import { StudyJob } from '@/schema/study'
import {
    dataForJobAction,
    updateStudyJobStatusAction,
} from '@/app/member/[memberIdentifier]/study/[studyIdentifier]/job/[studyJobIdentifier]/review/actions'
import { Button, Group } from '@mantine/core'
import React from 'react'
import { StudyJobStatus } from '@/database/types'
import { useMutation, useQuery } from '@tanstack/react-query'
import { MinimalJobInfo } from '@/lib/types'

export const JobReviewButtons = ({ job, decryptedResults }: { job: StudyJob; decryptedResults: string[] }) => {
    const jobInfo = useQuery({
        queryKey: ['jobInfo', job.id],
        queryFn: () => {
            return dataForJobAction(job.id)
        },
    }).data?.jobInfo

    const { mutate: updateStudyJob } = useMutation({
        mutationFn: async ({ jobInfo, status }: { jobInfo: MinimalJobInfo; status: StudyJobStatus }) => {
            await updateStudyJobStatusAction(jobInfo, status, decryptedResults)
        },
        onSuccess: () => {},
    })

    if (!jobInfo) return null

    // TODO Add job approvedAt/rejectedAt fields
    //  and render appropriately if they exist

    return (
        <Group>
            <Button
                color="#291BC4"
                onClick={() => updateStudyJob({ jobInfo: jobInfo, status: 'CODE-REJECTED' })}
                variant="outline"
            >
                Reject
            </Button>
            <Button color="#291BC4" onClick={() => updateStudyJob({ jobInfo: jobInfo, status: 'CODE-APPROVED' })}>
                Approve
            </Button>
        </Group>
    )
}
