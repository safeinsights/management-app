'use client'

import { FC } from 'react'
import { useUser } from '@clerk/nextjs'
import { Select } from '@mantine/core'
import { UseFormReturnType } from '@mantine/form'
import { useQuery } from '@/common'
import { FormField, nativeFieldProps } from '@/components/form-field'
import { ReadOnlyField } from '@/components/read-only-field'
import { getStudyCapableEnclaveOrgsAction } from '@/server/actions/org.actions'
import { StudyProposalFormValues } from '../form-schemas'
import { ORG_SELECT_ID } from './field-ids'

// "Data Partner" with both words capitalized is an intentional product exception, not a typo.
const LABEL = 'Data Partner'
const DESCRIPTION = 'Select a Data Partner to see the programming languages they support.'

interface DataPartnerFieldProps {
    form: UseFormReturnType<StudyProposalFormValues>
    isLocked: boolean
    lockedOrgName?: string
}

export const DataPartnerField: FC<DataPartnerFieldProps> = ({ form, isLocked, lockedOrgName }) => {
    const { user, isLoaded } = useUser()
    const isSessionReady = isLoaded && !!user

    const { data: orgs = [], isLoading } = useQuery({
        queryKey: ['orgs-with-languages'],
        queryFn: () => getStudyCapableEnclaveOrgsAction(),
        // The action's ability check needs a resolved Clerk session.
        enabled: isSessionReady,
    })

    if (isLocked) return <ReadOnlyField label={LABEL} value={lockedOrgName || form.getValues().orgSlug} />

    const error = form.errors.orgSlug

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
                {...form.getInputProps('orgSlug')}
                {...nativeFieldProps(error, { required: true, description: DESCRIPTION })}
            />
        </FormField>
    )
}
