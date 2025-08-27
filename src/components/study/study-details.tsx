import { FC, use } from 'react'
import { Badge, Divider, Grid, GridCol, Stack, Text, Tooltip } from '@mantine/core'
import { AlertNotFound } from '@/components/errors'
import { getStudyAction } from '@/server/actions/study.actions'
import { DownloadIcon } from '@phosphor-icons/react/dist/ssr'
import { StudyDocumentType } from '@/lib/types'
import { studyDocumentURL } from '@/lib/paths'
import { truncate } from '@/lib/string'
import { isActionError } from '@/lib/errors'

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
            rightSection={<DownloadIcon />}
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
    const study = use(getStudyAction({ studyId }))

    if (isActionError(study) || !study) {
        return <AlertNotFound title="Study was not found" message="no such study exists" />
    }

    const titleSpan = { base: 12, sm: 4, lg: 2 }
    const inputSpan = { base: 12, sm: 8, lg: 4 }

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
                    <Text fw="bold">Submitted by</Text>
                </GridCol>
                <GridCol span={inputSpan}>
                    <Text>{study.createdBy}</Text>
                </GridCol>
            </Grid>

            <Grid align="flex-start">
                <GridCol span={titleSpan}>
                    <Text fw="bold">Study Description</Text>
                </GridCol>
                <GridCol span={inputSpan}>
                    <Text>
                        {study.descriptionDocPath && (
                            <BadgeWithDescription
                                path={study.descriptionDocPath}
                                type={StudyDocumentType.DESCRIPTION}
                                studyId={study.id}
                            />
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
                            <BadgeWithDescription
                                path={study.irbDocPath}
                                type={StudyDocumentType.IRB}
                                studyId={study.id}
                            />
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
                            <BadgeWithDescription
                                path={study.agreementDocPath}
                                type={StudyDocumentType.AGREEMENT}
                                studyId={study.id}
                            />
                        )}
                    </Text>
                </GridCol>
            </Grid>
        </Stack>
    )
}
