import { StudyProposalFormValues } from '@/app/[orgSlug]/study/request/form-schemas'
import { useQuery } from '@/common'
import { FormFieldLabel } from '@/components/form-field-label'
import { PROPOSAL_GRID_SPAN } from '@/lib/constants'
import { getStudyCapableEnclaveOrgsAction } from '@/server/actions/org.actions'
import { useUser } from '@clerk/nextjs'
import { Divider, Grid, Paper, Select, Stack, Text, Title } from '@mantine/core'
import { UseFormReturnType } from '@mantine/form'
import { useParams } from 'next/navigation'

type Props = {
    form: UseFormReturnType<StudyProposalFormValues>
}

export const StudyOrgSelector: React.FC<Props> = ({ form }) => {
    const { user, isLoaded } = useUser()
    const { studyId } = useParams<{ studyId?: string }>()

    const { data: orgs = [], isLoading } = useQuery({
        queryKey: ['orgs-with-languages'],
        queryFn: () => getStudyCapableEnclaveOrgsAction(),
    })

    if (!isLoaded || !user) return null
    const { titleSpan, inputSpan } = PROPOSAL_GRID_SPAN

    const isExistingDraft = !!studyId

    return (
        <Paper p="xxl">
            <Text fz={10} fw={700} c="charcoal.7" pb={4}>
                STEP 1A
            </Text>
            <Title fz={20} order={4} c="charcoal.9">
                Data Organization
            </Title>
            <Divider my="md" />
            <Stack gap="xl">
                <Text>
                    <Text span fw={600}>
                        Select the Data Organization your study is intended for.
                    </Text>{' '}
                    This crucial initial step ensures your proposal is routed correctly for review. You can save a draft
                    or cancel at any time during the process.
                </Text>
                <Grid align="center">
                    <Grid.Col span={titleSpan}>
                        <FormFieldLabel label="Data Organization" inputId="studyOrg" />
                    </Grid.Col>
                    <Grid.Col span={inputSpan}>
                        <Select
                            id="studyOrg"
                            data-testid="org-select"
                            key={form.key('orgSlug')}
                            allowDeselect={false}
                            data={orgs.map((o) => ({ value: o.slug, label: o.name }))}
                            placeholder="Select a Data Organization"
                            disabled={isExistingDraft || isLoading}
                            {...form.getInputProps('orgSlug')}
                        />
                    </Grid.Col>
                </Grid>
            </Stack>
        </Paper>
    )
}
