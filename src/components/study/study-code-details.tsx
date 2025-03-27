import { use } from 'react'
import { Divider, Stack, Text } from '@mantine/core'
import { AlertNotFound } from '@/components/errors'
import { getMemberIdFromIdentifierAction } from '@/server/actions/user.actions'
import { getStudyAction } from '@/server/actions/study.actions'
import { StudyJobFiles } from '@/app/member/[memberIdentifier]/study/[studyIdentifier]/review/study-job-files'
import { latestJobForStudyAction } from '@/server/actions/user.actions'

export function StudyCodeDetails(props: {
    params: {
        memberIdentifier: string
        studyIdentifier: string
    }
}) {
    const { memberIdentifier, studyIdentifier } = props.params

    const member = use(getMemberIdFromIdentifierAction(memberIdentifier))
    if (!member) {
        return <AlertNotFound title="Member was not found" message="no such member exists" />
    }

    const study = use(getStudyAction(studyIdentifier))
    if (!study) {
        return <AlertNotFound title="Study was not found" message="no such study exists" />
    }

    const latestJob = use(latestJobForStudyAction(study.id))

    return (
        <Stack>
            <Divider />
            <Text order={6}>View the code files that you uploaded to run against the dataset.</Text>
            {/* {latestJob && <StudyJobFiles job={latestJob} />} */}
        </Stack>
    )
}
