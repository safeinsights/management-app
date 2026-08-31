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
    /** Pass `''` for a field with no placeholder text; the control itself stays visible. */
    placeholder?: string
    disabled?: boolean
    orgSlug?: string
}

/**
 * Stands in for a caller that asked for no placeholder text.
 *
 * Mantine types the inner search field with `!searchable && !placeholder ? 'hidden' : 'visible'`
 * and this component is never searchable, so an empty placeholder flips the field to
 * `data-type="hidden"`, which `PillsInput.css` collapses to a 1px, `opacity: 0`,
 * `pointer-events: none` box. That field carries the control's DOM id, so a hidden one both
 * removes the click target and sends `focusFirstInvalid` to an invisible element. A single space
 * is truthy for Mantine's test and renders as no visible text.
 */
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

    // Only while empty: that is the sole state carrying a required error, so the sole state the
    // field is a focus target in. With pills present Mantine hides the field and the pills box
    // takes over as the click target, which is the look both pages want.
    const fieldPlaceholder = value.length === 0 ? placeholder || BLANK_PLACEHOLDER : undefined

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
            placeholder={fieldPlaceholder}
            disabled={disabled}
            searchable={false}
            rightSection={<CaretUpDownIcon size={18} />}
            rightSectionPointerEvents="none"
        />
    )
}
