import { StudyProposalFormValues } from '@/app/[orgSlug]/study/request/form-schemas'
import { useQuery } from '@/common'
import { FormFieldLabel } from '@/components/form-field-label'
import { PROPOSAL_GRID_SPAN } from '@/lib/constants'
import { getStudyCapableEnclaveOrgsAction } from '@/server/actions/org.actions'
import { useUser } from '@clerk/nextjs'
import { Divider, Grid, Paper, Select, Stack, Text, Title } from '@mantine/core'
import { UseFormReturnType } from '@mantine/form'
import { useOpenStaxFeatureFlag } from '@/components/openstax-feature-flag'
import { useParams } from 'next/navigation'

type Props = {
    form: UseFormReturnType<StudyProposalFormValues>
}

export const StudyOrgSelector: React.FC<Props> = ({ form }) => {
    const { user, isLoaded } = useUser()
    const { studyId } = useParams<{ studyId?: string }>()
    const isFeatureFlagEnabled = useOpenStaxFeatureFlag()

    const { data: orgs = [], isLoading } = useQuery({
        queryKey: ['orgs-with-languages'],
        queryFn: () => getStudyCapableEnclaveOrgsAction(),
    })

    if (!isLoaded || !user) return null
    const { titleSpan, inputSpan } = PROPOSAL_GRID_SPAN

    const hasOrgSelected = !!form.values.orgSlug
    const isExistingDraft = isFeatureFlagEnabled && !!studyId

    const content = isFeatureFlagEnabled
        ? {
              step: hasOrgSelected ? 'STEP 1A' : 'STEP 1',
              title: 'Data organization',
              description:
                  'Select the data organization your study is intended for: This crucial initial step ensures your proposal is routed correctly for review. You can save a draft or cancel at any time during the process.',
          }
        : {
              step: 'STEP 1 OF 5',
              title: 'Select data organization',
              description:
                  'To begin your study proposal, please first select the data organization to which you wish to submit. This crucial initial step ensures your proposal is routed correctly for review. Once selected, you will proceed to fill in your study details and upload supporting documents. You can cancel at any time during the process.',
          }

    return (
        <Paper p="xl">
            <Text fz="sm" fw={700} c="gray.6" pb="sm">
                {content.step}
            </Text>
            <Title order={4}>{content.title}</Title>
            <Divider my="md" />
            <Stack gap="xl">
                <Text>{content.description}</Text>
                <Grid align="flex-start">
                    <Grid.Col span={titleSpan}>
                        <FormFieldLabel label="Data Organization" inputId="studyOrg" />
                    </Grid.Col>
                    <Grid.Col span={inputSpan}>
                        <Select
                            id="studyOrg"
                            data-testid="org-select"
                            key={form.key('orgSlug')}
                            data={orgs.map((o) => ({ value: o.slug, label: o.name }))}
                            placeholder="Select a data organization"
                            disabled={isExistingDraft || isLoading}
                            {...form.getInputProps('orgSlug')}
                        />
                    </Grid.Col>
                </Grid>
            </Stack>
        </Paper>
    )
}
