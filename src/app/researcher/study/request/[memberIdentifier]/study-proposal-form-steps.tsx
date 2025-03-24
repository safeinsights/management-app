'use client'

import React from 'react'
import { Button, Group, Stack } from '@mantine/core'
import { CancelButton } from '@/components/cancel-button'
import { useForm } from '@mantine/form'
import {
    StudyProposalFormValues,
    studyProposalSchema,
    zodResolver,
} from '@/app/researcher/study/request/[memberIdentifier]/study-proposal-schema'
import { StudyProposalForm } from '@/app/researcher/study/request/[memberIdentifier]/study-proposal'
import { UploadStudyJobCode } from '@/app/researcher/study/request/[memberIdentifier]/upload-study-job-code'
import { useMutation } from '@tanstack/react-query'
import { onCreateStudyAction } from '@/app/researcher/study/request/[memberIdentifier]/actions'
import { useRouter } from 'next/navigation'

export const StudyProposalFormSteps: React.FC<{ memberId: string }> = ({ memberId }) => {
    const router = useRouter()

    const { mutate: createStudy } = useMutation({
        mutationFn: async (formValues: StudyProposalFormValues) => {
            return await onCreateStudyAction(memberId, formValues)
        },
        onSuccess() {
            router.push(`/researcher/dashboard`)
        },
    })

    const studyProposalForm = useForm<StudyProposalFormValues>({
        validate: zodResolver(studyProposalSchema),
        validateInputOnBlur: true,
        initialValues: {
            title: '',
            piName: '',
            irbDocument: null,
            descriptionDocument: null,
            agreementDocument: null,
            codeFiles: [],
        },
    })

    // TODO Can we make a stepper https://mantine.dev/core/stepper/
    return (
        <form onSubmit={studyProposalForm.onSubmit((values) => studyProposalForm.validate() && createStudy(values))}>
            <Stack>
                <StudyProposalForm studyProposalForm={studyProposalForm} />
                <UploadStudyJobCode studyProposalForm={studyProposalForm} />
                <Group gap="xl" justify="flex-end">
                    {/* TODO Talk about removing cancel button, next/back buttons, submit button layout with UX */}
                    <CancelButton isDirty={studyProposalForm.isDirty()} />
                    <Button disabled={!studyProposalForm.isValid} type="submit" variant="filled" color="#291bc4">
                        Submit
                    </Button>
                </Group>
            </Stack>
        </form>
    )
}
