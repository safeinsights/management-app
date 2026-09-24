'use client'

import { FC, useState } from 'react'
import { Anchor, Box, Group } from '@mantine/core'
import { UseFormReturnType } from '@mantine/form'
import { ArrowSquareOutIcon } from '@phosphor-icons/react'
import { DatasetMultiSelect } from '@/components/dataset-multi-select'
import { FormField } from '@/components/form-field'
import { ReadOnlyField } from '@/components/read-only-field'
import { ExternalLinks } from '@/lib/routes'
import { displayOrgName } from '@/lib/string'
import { fontWeight, semanticColor } from '@/theme/tokens'
import { StudyProposalFormValues } from '../form-schemas'
import { DATASETS_FIELD_ID } from './field-ids'
import { useStudyCapableOrgs } from './use-study-capable-orgs'

const LABEL = 'Dataset(s) of interest'

const datasetsDescription = (orgName: string) => `Select the datasets available through ${orgName} for this study.`

// The form is uncontrolled, so its values are mirrored into state; reading them during render
// would freeze the pills and the partner name.
function useDatasetsOfInterest(form: UseFormReturnType<StudyProposalFormValues>, lockedDatasetNames?: string[]) {
    const [selectedOrgSlug, setSelectedOrgSlug] = useState(form.getValues().orgSlug)
    form.watch('orgSlug', ({ value }) => setSelectedOrgSlug(value))

    const [datasets, setDatasets] = useState(form.getValues().datasets)
    form.watch('datasets', ({ value }) => setDatasets(value))

    const { orgs } = useStudyCapableOrgs()
    const partnerName = orgs.find((org) => org.slug === selectedOrgSlug)?.name ?? ''
    const description = datasetsDescription(displayOrgName(partnerName))
    const lockedValue = (lockedDatasetNames ?? datasets).join(', ')

    const onChange = (value: string[]) => form.setFieldValue('datasets', value)
    const onBlur = () => form.validateField('datasets')

    return { selectedOrgSlug, datasets, description, lockedValue, onChange, onBlur }
}

interface DatasetsOfInterestFieldProps {
    form: UseFormReturnType<StudyProposalFormValues>
    // True once the draft has persisted datasets: they cannot be changed after Step 1.
    isLocked: boolean
    lockedDatasetNames?: string[]
}

export const DatasetsOfInterestField: FC<DatasetsOfInterestFieldProps> = ({ form, isLocked, lockedDatasetNames }) => {
    const { selectedOrgSlug, datasets, description, lockedValue, onChange, onBlur } = useDatasetsOfInterest(
        form,
        lockedDatasetNames,
    )

    if (isLocked) return <ReadOnlyField label={LABEL} value={lockedValue} />
    if (!selectedOrgSlug) return null

    const error = form.errors.datasets

    return (
        <FormField inputId={DATASETS_FIELD_ID} label={LABEL} required description={description} error={error}>
            <Group align="center" gap="xxl">
                {/* 60% of the card's inner content width; the Paper's padding is already
                    excluded. */}
                <Box w="60%">
                    <DatasetMultiSelect
                        id={DATASETS_FIELD_ID}
                        value={datasets}
                        onChange={onChange}
                        onBlur={onBlur}
                        error={error}
                        suppressOwnError
                        required
                        orgSlug={selectedOrgSlug}
                        // The card removes placeholder text from every input.
                        placeholder=""
                    />
                </Box>
                <Anchor
                    href={ExternalLinks.dataCatalog}
                    target="_blank"
                    rel="noopener noreferrer"
                    size="sm"
                    c={semanticColor('link.default')}
                    fw={fontWeight.semibold}
                >
                    <Group gap="xxs" wrap="nowrap">
                        Explore data catalog
                        <ArrowSquareOutIcon size={16} weight="bold" />
                    </Group>
                </Anchor>
            </Group>
        </FormField>
    )
}
