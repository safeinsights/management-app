import { FC, use } from 'react'
import { Badge, Divider, Grid, GridCol, Stack, Text, Tooltip } from '@mantine/core'
import { AlertNotFound } from '@/components/errors'
import { getStudyAction } from '@/server/actions/study.actions'
import { Download } from '@phosphor-icons/react/dist/ssr'
import { StudyDocumentType } from '@/lib/types'
import { studyDocumentURL } from '@/lib/paths'
import { truncate } from '@/lib/string'

interface BadgeWithDescriptionProps {
    path?: string | null
    type: StudyDocumentType
    studyId: string
}

const BadgeWithDescription: FC<BadgeWithDescriptionProps> = ({ path, type, studyId }) => {
    if (!path) return null

    const truncatedText = truncate(path)
    const needsTooltip = path.length > 20

    const badge = (
        <Badge
            key={path}
            color="#D4D1F3"
            c="black"
            component="a"
            href={studyDocumentURL(studyId, type, path)}
            target="_blank"
            rightSection={<Download />}
            style={{ cursor: 'pointer' }}
        >
            {truncatedText}
        </Badge>
    )

    if (needsTooltip) {
        return <Tooltip label={path}>{badge}</Tooltip>
    }

    return badge
}

export const StudyDetails: FC<{ studyId: string }> = ({ studyId }) => {
    const study = use(getStudyAction(studyId))
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
                                <BadgeWithDescription
                                    path={study.descriptionDocPath}
                                    type={StudyDocumentType.DESCRIPTION}
                                    studyId={study.id}
                                />
                            )}
                        </Text>
                        <Text>
                            {study.irbDocPath && (
                                <BadgeWithDescription
                                    path={study.irbDocPath}
                                    type={StudyDocumentType.IRB}
                                    studyId={study.id}
                                />
                            )}
                        </Text>
                        <Text>
                            {study.agreementDocPath && (
                                <BadgeWithDescription
                                    path={study.agreementDocPath}
                                    type={StudyDocumentType.AGREEMENT}
                                    studyId={study.id}
                                />
                            )}
                        </Text>
                    </Stack>
                </GridCol>
            </Grid>
        </Stack>
    )
}
