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
     * Set when a surrounding `FormField` renders the error message. The error node is still
     * passed to `MultiSelect` so its own `Input.Wrapper` computes `aria-describedby`, but its
     * duplicate rendering of the text is suppressed.
     */
    suppressOwnError?: boolean
    /** Marks the control required for assistive tech; the visible asterisk lives on the label. */
    required?: boolean
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
    suppressOwnError = false,
    required = false,
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
            // Passed so the inner wrapper folds the description id into `describedBy`; the
            // surrounding FormField renders the visible text (OTTER-647).
            description={suppressOwnError ? true : undefined}
            aria-required={required || undefined}
            inputWrapperOrder={suppressOwnError ? ['input'] : undefined}
            placeholder={value.length === 0 ? placeholder : undefined}
            disabled={disabled}
            searchable={false}
            rightSection={<CaretUpDownIcon size={18} />}
            rightSectionPointerEvents="none"
        />
    )
}
