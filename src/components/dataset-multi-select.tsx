'use client'

import { FC, type FocusEventHandler, type ReactNode } from 'react'
import { MultiSelect } from '@mantine/core'
import { CaretUpDownIcon } from '@phosphor-icons/react'
import { useOrgDataSources } from '@/hooks/use-org-data-sources'

// Accepts the props Mantine's form contract expects (value / onChange / onBlur / error) so
// call sites can spread `form.getInputProps('datasets')` and inherit blur validation.
interface DatasetMultiSelectProps {
    id: string
    value: string[]
    onChange: (value: string[]) => void
    onBlur?: FocusEventHandler<HTMLInputElement>
    error?: ReactNode
    /**
     * ARIA wiring from the surrounding `FormField`. Needed because `MultiSelect` renders its
     * own `Input.Wrapper`, which shadows the outer wrapper's context, so the error id has to
     * be applied directly. Use `fieldAria` to build it.
     */
    aria?: { 'aria-describedby'?: string; 'aria-invalid'?: boolean }
    placeholder?: string
    disabled?: boolean
    orgSlug?: string
}

export const DatasetMultiSelect: FC<DatasetMultiSelectProps> = ({
    id,
    value,
    onChange,
    onBlur,
    error,
    aria,
    placeholder = 'Select dataset(s) of interest',
    disabled = false,
    orgSlug,
}) => {
    const { options } = useOrgDataSources(orgSlug)

    return (
        <MultiSelect
            id={id}
            data={options}
            value={value}
            onChange={onChange}
            onBlur={onBlur}
            error={error}
            {...aria}
            placeholder={value.length === 0 ? placeholder : undefined}
            disabled={disabled}
            searchable={false}
            rightSection={<CaretUpDownIcon size={18} />}
            rightSectionPointerEvents="none"
        />
    )
}
