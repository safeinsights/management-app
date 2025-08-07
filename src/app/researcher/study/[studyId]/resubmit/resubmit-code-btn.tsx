'use client'

import { Button } from '@mantine/core'
import Link from 'next/link'
import { LatestJobForStudy } from '@/server/db/queries'
import { FC } from 'react'

interface ResubmitCodeButtonProps {
    job: LatestJobForStudy
}

export const ResubmitCodeButton: FC<ResubmitCodeButtonProps> = ({ job }) => {
    const studyId = job.studyId

    return (
        <Button component={Link} href={`/researcher/study/${studyId}/resubmit`}>
            Resubmit study code
        </Button>
    )
}
