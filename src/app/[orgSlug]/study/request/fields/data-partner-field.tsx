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
    /** True once the draft has a persisted Data Partner: it cannot be changed after Step 1. */
    isLocked: boolean
    /** Display name of the locked partner. Falls back to the slug only if the caller has none. */
    lockedOrgName?: string
}

export const DataPartnerField: FC<DataPartnerFieldProps> = ({ form, isLocked, lockedOrgName }) => {
    const { user, isLoaded } = useUser()

    const { data: orgs = [], isLoading } = useQuery({
        queryKey: ['orgs-with-languages'],
        queryFn: () => getStudyCapableEnclaveOrgsAction(),
        // The action requires an authenticated ability check, so it must not fire before Clerk
        // has resolved the session.
        enabled: isLoaded && !!user,
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
                placeholder="Select a Data Partner"
                disabled={isLoading}
                {...form.getInputProps('orgSlug')}
                {...nativeFieldProps(error, { required: true, description: DESCRIPTION })}
            />
        </FormField>
    )
}
