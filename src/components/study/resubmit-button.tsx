import { Button } from '@mantine/core'
import { Link } from '../links'
import { Routes } from '@/lib/routes'
import { use } from 'react'
import { getStudyAction } from '@/server/actions/study.actions'
import { isActionError } from '@/lib/errors'

export const ResubmitButton = ({ studyId }: { studyId: string }) => {
    const study = use(getStudyAction({ studyId }))

    if (isActionError(study) || !study?.submittedByOrgSlug) {
        throw new Error('Failed to load study with the submitting organization')
    }

    return (
        <Button component={Link} href={Routes.studyResubmit({ orgSlug: study.submittedByOrgSlug, studyId })}>
            + Resubmit study code
        </Button>
    )
}
