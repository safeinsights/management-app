import { StudyProposalFormValues } from '@/app/[orgSlug]/study/request/form-schemas'
import { useQuery } from '@/common'
import { FormFieldLabel } from '@/components/form-field-label'
import { PROPOSAL_GRID_SPAN } from '@/lib/constants'
import { getStudyCapableEnclaveOrgsAction } from '@/server/actions/org.actions'
import { useUser } from '@clerk/nextjs'
import { Divider, Grid, Paper, Select, Stack, Text, Title } from '@mantine/core'
import { UseFormReturnType } from '@mantine/form'
import { useParams } from 'next/navigation'
import { useState } from 'react'

type Props = {
    form: UseFormReturnType<StudyProposalFormValues>
}

export const StudyOrgSelector: React.FC<Props> = ({ form }) => {
    const { user, isLoaded } = useUser()
    const { studyId: routeStudyId } = useParams<{ studyId?: string }>()
    // OTTER-636 Phase 7: the draft is now lazy-created on Data-Partner selection (before the URL gains a
    // studyId). The request context stamps the new id into the form's `createdStudyId`; watch it so the
    // selector locks once a draft exists. The Data Partner is fixed at creation (the update path does not
    // change org), matching the edit flow.
    const [createdStudyId, setCreatedStudyId] = useState(form.getValues().createdStudyId)
    form.watch('createdStudyId', ({ value }) => setCreatedStudyId(value))

    const { data: orgs = [], isLoading } = useQuery({
        queryKey: ['orgs-with-languages'],
        queryFn: () => getStudyCapableEnclaveOrgsAction(),
    })

    if (!isLoaded || !user) return null
    const { titleSpan, inputSpan } = PROPOSAL_GRID_SPAN

    const isExistingDraft = !!routeStudyId || !!createdStudyId

    return (
        <Paper p="xxl">
            <Text fz={10} fw={700} c="charcoal.7" pb={4}>
                STEP 1A
            </Text>
            <Title fz={20} order={4} c="charcoal.9">
                Data Partner
            </Title>
            <Divider my="md" />
            <Stack gap="xl">
                <Text>
                    <Text span fw={600}>
                        Select the Data Partner your study is intended for.
                    </Text>{' '}
                    This crucial initial step ensures your proposal is routed correctly for review. You can save a draft
                    or cancel at any time during the process.
                </Text>
                <Grid align="center">
                    <Grid.Col span={titleSpan}>
                        <FormFieldLabel label="Data Partner" inputId="studyOrg" />
                    </Grid.Col>
                    <Grid.Col span={inputSpan}>
                        <Select
                            id="studyOrg"
                            data-testid="org-select"
                            key={form.key('orgSlug')}
                            allowDeselect={false}
                            data={orgs.map((o) => ({ value: o.slug, label: o.name }))}
                            placeholder="Select a Data Partner"
                            disabled={isExistingDraft || isLoading}
                            {...form.getInputProps('orgSlug')}
                        />
                    </Grid.Col>
                </Grid>
            </Stack>
        </Paper>
    )
}
