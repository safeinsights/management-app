'use client'

import { FC, type FocusEventHandler, type ReactNode } from 'react'
import { MultiSelect } from '@mantine/core'
import { CaretUpDownIcon } from '@phosphor-icons/react'
import { useOrgDataSources } from '@/hooks/use-org-data-sources'

// Mirrors Mantine's form contract so call sites can spread `form.getInputProps('datasets')`.
interface DatasetMultiSelectProps {
    id: string
    value: string[]
    onChange: (value: string[]) => void
    onBlur?: FocusEventHandler<HTMLInputElement>
    error?: ReactNode
    /** Set when a surrounding `FormField` renders the error message, to avoid rendering it twice. */
    suppressOwnError?: boolean
    required?: boolean
    /** Pass `''` for a field with no placeholder text; the control itself stays visible. */
    placeholder?: string
    disabled?: boolean
    orgSlug?: string
}

// A falsy placeholder collapses this non-searchable MultiSelect's inner field, which carries the
// DOM id, to a 1px invisible box. A single space is truthy for Mantine and renders as nothing.
const BLANK_PLACEHOLDER = ' '

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

    // Only while empty: with pills present Mantine hides the field and the pills box takes over
    // as the click target.
    const fieldPlaceholder = value.length === 0 ? placeholder || BLANK_PLACEHOLDER : undefined

    return (
        <MultiSelect
            id={id}
            data={options}
            value={value}
            onChange={onChange}
            onBlur={onBlur}
            error={error}
            // Truthy only so the inner wrapper folds the description id into `describedBy`; the
            // surrounding FormField renders the visible text (OTTER-647).
            description={suppressOwnError ? true : undefined}
            aria-required={required || undefined}
            inputWrapperOrder={suppressOwnError ? ['input'] : undefined}
            placeholder={fieldPlaceholder}
            disabled={disabled}
            searchable={false}
            rightSection={<CaretUpDownIcon size={18} />}
            rightSectionPointerEvents="none"
        />
    )
}
