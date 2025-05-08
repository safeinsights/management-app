import { FC, use } from 'react'
import { Badge, Divider, Grid, GridCol, Stack, Text, Tooltip } from '@mantine/core'
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

    const truncate = (text: string) => {
        if (text.length > 20) {
            return text.substring(0, 20) + '...'
        }
        return text
    }

    // Function to render badge with tooltip for truncated text
    const renderBadge = (docPath: string, docType: StudyDocumentType, studyId: string) => {
        const truncatedText = truncate(docPath)
        const needsTooltip = docPath.length > 20

        const badge = (
            <Badge
                key={docPath}
                color="#D4D1F3"
                c="black"
                component="a"
                href={studyDocumentURL(studyId, docType, docPath)}
                target="_blank"
                rightSection={<Download />}
                style={{ cursor: 'pointer' }}
            >
                {truncatedText}
            </Badge>
        )

        if (needsTooltip) {
            return <Tooltip label={docPath}>{badge}</Tooltip>
        }

        return badge
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
                            {study.descriptionDocPath &&
                                renderBadge(study.descriptionDocPath, StudyDocumentType.DESCRIPTION, study.id)}
                        </Text>
                        <Text>
                            {study.irbDocPath && renderBadge(study.irbDocPath, StudyDocumentType.IRB, study.id)}
                        </Text>
                        <Text>
                            {study.agreementDocPath &&
                                renderBadge(study.agreementDocPath, StudyDocumentType.AGREEMENT, study.id)}
                        </Text>
                    </Stack>
                </GridCol>
            </Grid>
        </Stack>
    )
}
