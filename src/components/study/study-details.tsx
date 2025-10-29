import { AlertNotFound } from '@/components/errors'
import { PROPOSAL_GRID_SPAN } from '@/lib/constants'
import { isActionError } from '@/lib/errors'
import { studyDocumentURL } from '@/lib/paths'
import { truncate } from '@/lib/string'
import { StudyDocumentType } from '@/lib/types'
import { Badge, Divider, Grid, GridCol, Stack, Text, Tooltip } from '@mantine/core'
import { DownloadIcon } from '@phosphor-icons/react/dist/ssr'
import { FC } from 'react'

interface Study {
    id: string
    title: string
    piName: string
    createdBy: string
    descriptionDocPath?: string | null
    irbDocPath?: string | null
    agreementDocPath?: string | null
    status: string
    approvedAt: Date | null
    rejectedAt: Date | null
    orgSlug: string
}

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
            <span>{truncatedText}</span>
        </Badge>
    )

    if (needsTooltip) {
        return <Tooltip label={path}>{badge}</Tooltip>
    }

    return badge
}

export const StudyDetails: FC<{ study: Study }> = ({ study }) => {
    if (isActionError(study) || !study) {
        return <AlertNotFound title="Study was not found" message="no such study exists" />
    }

    const { titleSpan, inputSpan } = PROPOSAL_GRID_SPAN

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
