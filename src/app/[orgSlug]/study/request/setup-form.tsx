'use client'

import { FC, type ChangeEvent } from 'react'
import { Stack, Text } from '@mantine/core'
import { UseFormReturnType } from '@mantine/form'
import { ProposalStepHeader } from '@/components/study/proposal-step-header'
import { StudyProposalFormValues } from './form-schemas'
import { StudyTitleField } from './fields/study-title-field'
import { DataPartnerField } from './fields/data-partner-field'
import { ProgrammingLanguageField } from './fields/programming-language-field'
import type { SetupFormLocks } from './use-setup-form'

const INTRO = 'Name your study and select a Data Partner so your proposal goes to the right organization for review.'

interface SetupFormProps extends SetupFormLocks {
    form: UseFormReturnType<StudyProposalFormValues>
    titleValue: string
    titleError: string | undefined
    onTitleChange: (event: ChangeEvent<HTMLInputElement>) => void
    onTitleBlur: () => void
    lockedOrgName?: string
    lockedLanguageLabel?: string
}

export const SetupForm: FC<SetupFormProps> = ({
    form,
    titleValue,
    titleError,
    onTitleChange,
    onTitleBlur,
    isTitleLocked,
    isOrgLocked,
    isLanguageLocked,
    lockedOrgName,
    lockedLanguageLabel,
}) => (
    // ProposalStepHeader supplies the card, the eyebrow, the heading and the 24px divider, which
    // is the "reuse the section header component" requirement. No studyTitle: this step is where
    // the title is entered, so it must not also appear as body text.
    // Literal 24 rather than gap="lg": this app's Mantine `lg` is 20px, while the design token is
    // 24px. Once the theme scale is aligned these can switch to the token.
    <ProposalStepHeader stepLabel="STEP 1" heading="Set up study">
        <Stack gap={24}>
            <Text>{INTRO}</Text>
            <Stack gap="xl">
                <StudyTitleField
                    value={titleValue}
                    error={titleError}
                    onChange={onTitleChange}
                    onBlur={onTitleBlur}
                    isLocked={isTitleLocked}
                />
                <DataPartnerField form={form} isLocked={isOrgLocked} lockedOrgName={lockedOrgName} />
                <ProgrammingLanguageField
                    form={form}
                    isLocked={isLanguageLocked}
                    lockedLanguageLabel={lockedLanguageLabel}
                />
            </Stack>
        </Stack>
    </ProposalStepHeader>
)
