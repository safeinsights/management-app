'use client'

import { Pill, PillsInput, Text } from '@mantine/core'
import type { UseFormReturnType } from '@mantine/form'
import type { ResearchDetailsValues } from '@/schema/researcher-profile'

interface ResearchInterestsInputProps {
    form: UseFormReturnType<ResearchDetailsValues>
    draftValue: string
    onDraftChange: (value: string) => void
    onAdd: () => void
    onRemove: (index: number) => void
}

export function ResearchInterestsInput({
    form,
    draftValue,
    onDraftChange,
    onAdd,
    onRemove,
}: ResearchInterestsInputProps) {
    const interests = form.values.researchInterests || []
    const maxItems = 5
    const isAtLimit = interests.length >= maxItems

    const interestPills = interests.map((item, idx) => (
        <Pill key={form.key(`researchInterests.${idx}`)} withRemoveButton onRemove={() => onRemove(idx)}>
            {item}
        </Pill>
    ))

    return (
        <>
            <PillsInput id="researchInterests" error={form.errors.researchInterests as unknown as string}>
                <Pill.Group>
                    {interestPills}
                    <PillsInput.Field
                        placeholder={isAtLimit ? '' : 'Type a research interest and press enter'}
                        value={draftValue}
                        onChange={(e) => onDraftChange(e.currentTarget.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault()
                                onAdd()
                            }
                            if (e.key === 'Backspace' && !draftValue && interests.length > 0) {
                                onRemove(interests.length - 1)
                            }
                        }}
                        disabled={isAtLimit}
                    />
                </Pill.Group>
            </PillsInput>
            <Text size="sm" mt={4}>
                Include up to five area(s) of research interest.
            </Text>
        </>
    )
}
