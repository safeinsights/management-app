import { use } from 'react'
import { Divider, Grid, GridCol, Stack, Text, Badge } from '@mantine/core'
import { AlertNotFound } from '@/components/errors'
import { getMemberIdFromIdentifierAction } from '@/server/actions/user.actions'
import { getStudyAction } from '@/server/actions/study.actions'
import { dataForStudyDocumentsAction } from '@/server/actions/study-job.actions'
import { Download } from '@phosphor-icons/react/dist/ssr'

// TODO Call this StudyDetails?
export function StudyDetails(props: {
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

    const documents = use(dataForStudyDocumentsAction(studyIdentifier))
    if (!documents) {
        return <AlertNotFound title="Documents were not found" message="no such documents exists" />
    }

    return (
        <Stack>
            <Divider />
            <Grid>
                <GridCol span={3}>
                    <Stack>
                        <Text fw="bold">Study Name</Text>
                        <Text fw="bold">Principal investigator</Text>
                        <Text fw="bold">Researcher</Text>
                        <Text fw="bold">Study Description</Text>
                        <Text fw="bold">IRB</Text>
                        <Text fw="bold">Agreement(s)</Text>
                    </Stack>
                </GridCol>
                <GridCol span={9}>
                    <Stack>
                        <Text>{study.title}</Text>
                        <Text>{study.piName}</Text>
                        <Text>{study.researcherName}</Text>
                        <Text>
                            {study.descriptionDocPath && (
                                <Badge
                                    key={study.descriptionDocPath}
                                    color="#D4D1F3"
                                    c="black"
                                    component="a"
                                    href={`/dl/study/${documents.studyInfo.memberIdentifier}/${studyIdentifier}/docs/${study.descriptionDocPath}`}
                                    target="_blank"
                                    rightSection={<Download />}
                                    style={{ cursor: 'pointer' }}
                                >
                                    {study.descriptionDocPath}
                                </Badge>
                            )}
                        </Text>
                        <Text>
                            {study.irbDocPath && (
                                <Badge
                                    key={study.irbDocPath}
                                    color="#D4D1F3"
                                    c="black"
                                    component="a"
                                    href={`/dl/study/${documents.studyInfo.memberIdentifier}/${studyIdentifier}/docs/${study.irbDocPath}`}
                                    target="_blank"
                                    rightSection={<Download />}
                                    style={{ cursor: 'pointer' }}
                                >
                                    {study.irbDocPath}
                                </Badge>
                            )}
                        </Text>
                        <Text>
                            {study.agreementDocPath && (
                                <Badge
                                    key={study.agreementDocPath}
                                    color="#D4D1F3"
                                    c="black"
                                    component="a"
                                    href={`/dl/study/${documents.studyInfo.memberIdentifier}/${studyIdentifier}/docs/${study.agreementDocPath}`}
                                    target="_blank"
                                    rightSection={<Download />}
                                    style={{ cursor: 'pointer' }}
                                >
                                    {study.agreementDocPath}
                                </Badge>
                            )}
                        </Text>
                    </Stack>
                </GridCol>
            </Grid>
        </Stack>
    )
}
