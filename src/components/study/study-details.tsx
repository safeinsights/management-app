import { AlertNotFound } from '@/components/errors'
import { PROPOSAL_GRID_SPAN } from '@/lib/constants'
import { isActionError } from '@/lib/errors'
import { studyDocumentURL } from '@/lib/paths'
import { StudyDocumentType } from '@/lib/types'
import { getStudyAction } from '@/server/actions/study.actions'
import { Divider, Grid, GridCol, Stack, Text } from '@mantine/core'
import { FC, use } from 'react'
import { FileChip } from '@/components/file-chip'

interface BadgeWithDescriptionProps {
    path?: string | null
    type: StudyDocumentType
    studyId: string
}

const BadgeWithDescription: FC<BadgeWithDescriptionProps> = ({ path, type, studyId }) => {
    if (!path) return null

    return <FileChip href={studyDocumentURL(studyId, type, path)} filename={path} key={path} />
}

export const StudyDetails: FC<{ studyId: string }> = ({ studyId }) => {
    const study = use(getStudyAction({ studyId }))
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
