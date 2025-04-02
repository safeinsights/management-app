'use client'

import React from 'react'
import { Button, Group, Stack } from '@mantine/core'
import { notifications } from '@mantine/notifications'
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
            return await onCreateStudyAction({ memberId, studyInfo: formValues })
        },
        onSuccess() {
            notifications.show({
                title: 'Study Proposal Submitted',
                message:
                    'Your proposal has been successfully submitted to the reviewing organization. Check your dashboard for status updates.',
                color: 'green',
            })
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
        <form
            onSubmit={studyProposalForm.onSubmit(
                (values: StudyProposalFormValues) => studyProposalForm.validate() && createStudy(values),
            )}
        >
            <Stack>
                <StudyProposalForm studyProposalForm={studyProposalForm} />
                <UploadStudyJobCode studyProposalForm={studyProposalForm} />
                <Group gap="xl" justify="flex-end">
                    {/* TODO Talk about removing cancel button, next/back buttons, submit button layout with UX */}
                    <CancelButton isDirty={studyProposalForm.isDirty()} />
                    <Button disabled={!studyProposalForm.isValid} type="submit" variant="filled">
                        Submit
                    </Button>
                </Group>
            </Stack>
        </form>
    )
}
