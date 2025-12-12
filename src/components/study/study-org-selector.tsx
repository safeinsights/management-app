import { StudyProposalFormValues } from '@/app/[orgSlug]/study/request/study-proposal-form-schema'
import { useQuery } from '@/common'
import { FormFieldLabel } from '@/components/form-field-label'
import { PROPOSAL_GRID_SPAN } from '@/lib/constants'
import { getStudyCapableEnclaveOrgsAction } from '@/server/actions/org.actions'
import { useUser } from '@clerk/nextjs'
import { Divider, Grid, Paper, Select, Stack, Text, Title } from '@mantine/core'
import { UseFormReturnType } from '@mantine/form'

type Props = { form: UseFormReturnType<StudyProposalFormValues> }

export const StudyOrgSelector: React.FC<Props> = ({ form }) => {
    const { user, isLoaded } = useUser()

    const { data: orgs = [], isLoading } = useQuery({
        queryKey: ['orgs-with-languages'],
        queryFn: () => getStudyCapableEnclaveOrgsAction(),
    })

    if (!isLoaded || !user) return null
    const { titleSpan, inputSpan } = PROPOSAL_GRID_SPAN

    return (
        <Paper p="xl" mb="xxl">
            <Text fz="sm" fw={700} c="gray.6" pb="sm">
                Step 1 of 5
            </Text>
            <Title order={4}>Select data organization</Title>
            <Divider my="md" />
            <Stack gap="xl">
                <Text>
                    To begin your study proposal, please first select the data organization to which you wish to submit.
                    This crucial initial step ensures your proposal is routed correctly for review. Once selected, you
                    will proceed to fill in your study details and upload supporting documents. You can cancel at any
                    time during the process.
                </Text>
                <Grid align="flex-start">
                    <Grid.Col span={titleSpan}>
                        <FormFieldLabel label="Data Organization" inputId="studyOrg" />
                    </Grid.Col>
                    <Grid.Col span={inputSpan}>
                        <Select
                            id="studyOrg"
                            data-testid="org-select"
                            data={orgs.map((o) => ({ value: o.slug, label: o.name }))}
                            value={form.values.orgSlug}
                            placeholder="Select a data organization"
                            disabled={isLoading}
                            onChange={(value) => {
                                form.setFieldValue('orgSlug', value || '')
                            }}
                        />
                    </Grid.Col>
                </Grid>
            </Stack>
        </Paper>
    )
}
