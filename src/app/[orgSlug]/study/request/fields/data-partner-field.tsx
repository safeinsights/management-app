'use client'

import { FC } from 'react'
import { Select } from '@mantine/core'
import { UseFormReturnType } from '@mantine/form'
import { FormField, nativeFieldProps } from '@/components/form-field'
import { ReadOnlyField } from '@/components/read-only-field'
import { StudyProposalFormValues } from '../form-schemas'
import { ORG_SELECT_ID } from './field-ids'
import { useStudyCapableOrgs } from './use-study-capable-orgs'

// "Data Partner" with both words capitalized is an intentional product exception, not a typo.
const LABEL = 'Data Partner'
const DESCRIPTION = 'Select a Data Partner to see the programming languages they support.'

// Datasets belong to one Data Partner, so choosing another starts them over. Done on the user's
// change rather than in a watcher, which would also fire when a draft is seeded.
const clearDatasetsOnPartnerChange =
    (form: UseFormReturnType<StudyProposalFormValues>, onChange: (value: string | null) => void) =>
    (value: string | null) => {
        const isNewPartner = value !== form.getValues().orgSlug
        onChange(value)
        if (isNewPartner) form.setFieldValue('datasets', [])
    }

interface DataPartnerFieldProps {
    form: UseFormReturnType<StudyProposalFormValues>
    isLocked: boolean
    lockedOrgName?: string
}

export const DataPartnerField: FC<DataPartnerFieldProps> = ({ form, isLocked, lockedOrgName }) => {
    const { orgs, isLoading, isSessionReady } = useStudyCapableOrgs()

    if (isLocked) return <ReadOnlyField label={LABEL} value={lockedOrgName || form.getValues().orgSlug} />

    const error = form.errors.orgSlug
    const inputProps = form.getInputProps('orgSlug')
    const onChange = clearDatasetsOnPartnerChange(form, inputProps.onChange)

    return (
        <FormField inputId={ORG_SELECT_ID} label={LABEL} required description={DESCRIPTION} error={error}>
            <Select
                id={ORG_SELECT_ID}
                data-testid="org-select"
                maw={478}
                key={form.key('orgSlug')}
                allowDeselect={false}
                data={orgs.map((o) => ({ value: o.slug, label: o.name }))}
                // Step 1 shows no placeholder text, like Step 2 (OTTER-691).
                placeholder=""
                // A query held back by `enabled` reports isLoading false, so the Select would
                // otherwise open with an empty list.
                disabled={isLoading || !isSessionReady}
                {...inputProps}
                onChange={onChange}
                {...nativeFieldProps(error, { required: true, description: DESCRIPTION })}
            />
        </FormField>
    )
}
