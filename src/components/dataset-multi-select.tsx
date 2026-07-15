'use client'

import { FC } from 'react'
import { MultiSelect } from '@mantine/core'
import { CaretUpDownIcon } from '@phosphor-icons/react'
import { useOrgDataSources } from '@/hooks/use-org-data-sources'

interface DatasetMultiSelectProps {
    id: string
    value: string[]
    onChange: (value: string[]) => void
    placeholder?: string
    disabled?: boolean
    orgSlug?: string
}

export const DatasetMultiSelect: FC<DatasetMultiSelectProps> = ({
    id,
    value,
    onChange,
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
            placeholder={value.length === 0 ? placeholder : undefined}
            disabled={disabled}
            searchable={false}
            rightSection={<CaretUpDownIcon size={18} />}
            rightSectionPointerEvents="none"
        />
    )
}
