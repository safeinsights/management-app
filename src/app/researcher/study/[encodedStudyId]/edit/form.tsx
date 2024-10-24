'use client'

import React, { useState } from 'react'

import { Form as HookForm, useForm } from 'react-hook-form'
import { Checkbox, Textarea, TextInput } from 'react-hook-form-mantine'
import { inputStyle, labelStyle } from './style.css'
import { Button, Flex, Group, Stack, Text } from '@mantine/core'
import { onUpdateStudyAction } from './actions'
import { FormValues, schema, zodResolver } from './schema'
import Link from 'next/link'

export const Form: React.FC<{ studyId: string; study: FormValues }> = ({ studyId, study }) => {
    const { control, getValues } = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: { ...study, highlights: true, eventCapture: true },
        mode: 'onChange',
    })
    const [isDisabled, setIsDisabled] = useState(true)
    const [isFormValid, setIsFormValid] = useState(true)
    const enableButton = () => {
        setIsDisabled(false)
    }
    const checkFormValid = () => {
        const values = getValues()
        const hasChecked = values.highlights || values.eventCapture
        setIsFormValid(hasChecked ?? false)
    }

    return (
        <HookForm
            control={control}
            onChange={checkFormValid}
            onSubmit={async ({ data }) => await onUpdateStudyAction(studyId, data)}
            onError={(e) => console.warn(e)}
        >
            <Stack>
                <Text size="xl" ta="left" mb={30}>
                    OpenStax Study Proposal Step 3)
                </Text>
                <Text size="xl" ta="left">
                    STUDY DETAILS
                </Text>

                <Flex p={2} gap="md" wrap="wrap">
                    <Text className={labelStyle}>Study Title</Text>
                    <TextInput
                        bg="#ddd"
                        bd="1px solid #ccc"
                        disabled
                        className={inputStyle}
                        name="title"
                        data-testid="study-title"
                        control={control}
                        readOnly
                    />
                </Flex>

                <Flex p={2} gap="md" wrap="wrap">
                    <Text className={labelStyle}>Study Description</Text>
                    <Textarea className={inputStyle} name="description" label="" control={control} />
                </Flex>

                <Flex p={2} gap="md">
                    <Text className={labelStyle}>Principal Investigator</Text>
                    <TextInput className={inputStyle} name="piName" control={control} />
                </Flex>
                <Group p={2} gap="md">
                    <Text className={labelStyle}>IRB Approval Documentation</Text>
                    <Text bd="1px solid #ccc" p="5px" bg="#ddd" className={inputStyle} data-testid="irb-doc">
                        {' '}
                        IRB Document.pdf
                    </Text>
                    <Text fs="italic" c="dimmed" w="10%">
                        {'For the pilot, we are skipping the IRB step'}
                    </Text>
                </Group>
            </Stack>

            <Text size="xl" ta="left" mt={50}>
                REQUESTED DATA DETAILS
            </Text>
            <Stack align="stretch">
                <Flex p={2} gap="lg">
                    <Text className={labelStyle}>Datasets of Interest</Text>
                    <Stack>
                        <Checkbox
                            name="highlights"
                            control={control}
                            value="highlights"
                            label="Highhlights and Notes"
                        ></Checkbox>
                        <Checkbox
                            name="eventCapture"
                            control={control}
                            value="event-capture"
                            label="Event Capture"
                        ></Checkbox>
                    </Stack>
                </Flex>
                <Flex p={2} gap="md" wrap="wrap">
                    <Text className={labelStyle}>Container URL</Text>
                    <TextInput
                        bg="#ddd"
                        bd="1px solid #ccc"
                        disabled
                        className={inputStyle}
                        name="containerLocation"
                        data-testid="container-location"
                        control={control}
                        readOnly
                    />
                </Flex>
            </Stack>

            <Group gap="xl" p={2} justify="flex-end">
                <Link href="/researcher/studies" passHref>
                    <Button disabled={isDisabled || !isFormValid}>Back to all studies</Button>
                </Link>
                <Button disabled={!isFormValid} onClick={enableButton} type="submit" variant="default">
                    Submit Proposal
                </Button>
            </Group>
        </HookForm>
    )
}
