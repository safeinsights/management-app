import { FC, use } from 'react'
import { Badge, Divider, Grid, GridCol, Stack, Text } from '@mantine/core'
import { AlertNotFound } from '@/components/errors'
import { getStudyAction } from '@/server/actions/study.actions'
import { Download } from '@phosphor-icons/react/dist/ssr'
import { StudyDocumentType } from '@/lib/types'
import { studyDocumentURL } from '@/lib/paths'

export const StudyDetails: FC<{ studyIdentifier: string }> = ({ studyIdentifier }) => {
    const study = use(getStudyAction(studyIdentifier))
    if (!study) {
        return <AlertNotFound title="Study was not found" message="no such study exists" />
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
                                    href={studyDocumentURL(
                                        study.id,
                                        StudyDocumentType.DESCRIPTION,
                                        study.descriptionDocPath,
                                    )}
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
                                    href={studyDocumentURL(study.id, StudyDocumentType.IRB, study.irbDocPath)}
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
                                    href={studyDocumentURL(
                                        study.id,
                                        StudyDocumentType.AGREEMENT,
                                        study.agreementDocPath,
                                    )}
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
