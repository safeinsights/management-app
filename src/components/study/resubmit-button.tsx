import { Button } from '@mantine/core'
import { Link } from '../links'
import { Routes } from '@/lib/routes'

export const ResubmitButton = ({ studyId, orgSlug }: { studyId: string; orgSlug: string }) => {
    return (
        <Button component={Link} href={Routes.studyResubmit({ orgSlug, studyId })}>
            + Resubmit study code
        </Button>
    )
}
