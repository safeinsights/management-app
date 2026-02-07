'use client'

import { FC, useState } from 'react'
import { Combobox, Group, Pill, PillsInput, Text, useCombobox, CheckIcon } from '@mantine/core'

export interface DatasetOption {
    value: string
    label: string
}

interface DatasetMultiSelectProps {
    options: DatasetOption[]
    value: string[]
    onChange: (value: string[]) => void
    placeholder?: string
    disabled?: boolean
}

export const DatasetMultiSelect: FC<DatasetMultiSelectProps> = ({
    options,
    value,
    onChange,
    placeholder = 'Select dataset(s) of interest',
    disabled = false,
}) => {
    const [search, setSearch] = useState('')
    const combobox = useCombobox({
        onDropdownClose: () => combobox.resetSelectedOption(),
        onDropdownOpen: () => combobox.updateSelectedOptionIndex('active'),
    })

    const handleValueSelect = (val: string) => {
        if (value.includes(val)) {
            onChange(value.filter((v) => v !== val))
        } else {
            onChange([...value, val])
        }
    }

    const handleValueRemove = (val: string) => {
        onChange(value.filter((v) => v !== val))
    }

    const filteredOptions = options.filter((item) => item.label.toLowerCase().includes(search.trim().toLowerCase()))

    const pills = value.map((val) => {
        const option = options.find((o) => o.value === val)
        if (!option) return null
        return (
            <Pill key={val} withRemoveButton onRemove={() => handleValueRemove(val)} disabled={disabled}>
                {option.label}
            </Pill>
        )
    })

    const comboboxOptions = filteredOptions.map((item) => {
        const isSelected = value.includes(item.value)
        return (
            <Combobox.Option value={item.value} key={item.value} active={isSelected}>
                <Group gap="sm">
                    {isSelected && <CheckIcon size={12} />}
                    <span>{item.label}</span>
                </Group>
            </Combobox.Option>
        )
    })

    return (
        <Combobox store={combobox} onOptionSubmit={handleValueSelect}>
            <Combobox.DropdownTarget>
                <PillsInput onClick={() => combobox.openDropdown()} disabled={disabled}>
                    <Pill.Group>
                        {pills}
                        <Combobox.EventsTarget>
                            <PillsInput.Field
                                onFocus={() => combobox.openDropdown()}
                                onBlur={() => combobox.closeDropdown()}
                                value={search}
                                placeholder={value.length === 0 ? placeholder : undefined}
                                onChange={(event) => {
                                    combobox.updateSelectedOptionIndex()
                                    setSearch(event.currentTarget.value)
                                }}
                                onKeyDown={(event) => {
                                    if (event.key === 'Backspace' && search.length === 0) {
                                        event.preventDefault()
                                        handleValueRemove(value[value.length - 1])
                                    }
                                }}
                            />
                        </Combobox.EventsTarget>
                    </Pill.Group>
                </PillsInput>
            </Combobox.DropdownTarget>

            <Combobox.Dropdown>
                <Combobox.Options>
                    {comboboxOptions.length > 0 ? (
                        comboboxOptions
                    ) : (
                        <Combobox.Empty>
                            <Text size="sm" c="dimmed">
                                No datasets found
                            </Text>
                        </Combobox.Empty>
                    )}
                </Combobox.Options>
            </Combobox.Dropdown>
        </Combobox>
    )
}
