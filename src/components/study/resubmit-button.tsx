import { Button } from '@mantine/core'
import { Link } from '../links'

export const ResubmitButton = ({ studyId, orgSlug }: { studyId: string; orgSlug: string }) => {
    return (
        <Button component={Link} href={`/researcher/study/${studyId}/resubmit/${orgSlug}`}>
            + Resubmit study code
        </Button>
    )
}
