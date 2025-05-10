import { FC, use } from 'react'
import { Badge, Divider, Grid, GridCol, Stack, Text } from '@mantine/core'
import { AlertNotFound } from '@/components/errors'
import { getStudyAction } from '@/server/actions/study.actions'
import { Download } from '@phosphor-icons/react/dist/ssr'
import { StudyDocumentType } from '@/lib/types'
import { studyDocumentURL } from '@/lib/paths'

export const StudyDetails: FC<{ studyId: string }> = ({ studyId }) => {
    const study = use(getStudyAction(studyId))
    if (!study) {
        return <AlertNotFound title="Study was not found" message="no such study exists" />
    }

    const titleSpan = { base: 12, sm: 4, md: 3 }
    const inputSpan = { base: 12, sm: 8, md: 9 }

    return (
        <Stack>
            <Divider />

            <Grid align="flex-start">
                <GridCol span={titleSpan}>
                    <Text fw="bold">Study Name</Text>
                </GridCol>
                <GridCol span={inputSpan}>
                    <Text>{study.title}</Text>
                </GridCol>
            </Grid>

            <Grid align="flex-start">
                <GridCol span={titleSpan}>
                    <Text fw="bold">Principal investigator</Text>
                </GridCol>
                <GridCol span={inputSpan}>
                    <Text>{study.piName}</Text>
                </GridCol>
            </Grid>

            <Grid align="flex-start">
                <GridCol span={titleSpan}>
                    <Text fw="bold">Researcher</Text>
                </GridCol>
                <GridCol span={inputSpan}>
                    <Text>{study.researcherName}</Text>
                </GridCol>
            </Grid>

            <Grid align="flex-start">
                <GridCol span={titleSpan}>
                    <Text fw="bold">Study Description</Text>
                </GridCol>
                <GridCol span={inputSpan}>
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
                </GridCol>
            </Grid>

            <Grid align="flex-start">
                <GridCol span={titleSpan}>
                    <Text fw="bold">IRB</Text>
                </GridCol>
                <GridCol span={inputSpan}>
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
                </GridCol>
            </Grid>

            <Grid align="flex-start">
                <GridCol span={titleSpan}>
                    <Text fw="bold">Agreement(s)</Text>
                </GridCol>
                <GridCol span={inputSpan}>
                    <Text>
                        {study.agreementDocPath && (
                            <Badge
                                key={study.agreementDocPath}
                                color="#D4D1F3"
                                c="black"
                                component="a"
                                href={studyDocumentURL(study.id, StudyDocumentType.AGREEMENT, study.agreementDocPath)}
                                target="_blank"
                                rightSection={<Download />}
                                style={{ cursor: 'pointer' }}
                            >
                                {study.agreementDocPath}
                            </Badge>
                        )}
                    </Text>
                </GridCol>
            </Grid>
        </Stack>
    )
}
