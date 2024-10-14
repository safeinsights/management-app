'use client'

import React from 'react'

import { Form as HookForm, useForm } from 'react-hook-form'
import { Checkbox, Select, Textarea, TextInput } from 'react-hook-form-mantine'

import { inputStyle, labelStyle } from './style.css'
import { Button, Flex, Stack, Text } from '@mantine/core'
import { onUpdateStudyAction } from './actions'
import { FormValues, schema, zodResolver } from './schema'

export const Form: React.FC<{ studyId: string; study: FormValues }> = ({ studyId, study }) => {
    const { control } = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: study,
    })

    return (
        <HookForm
            control={control}
            onSubmit={async ({ data }) => await onUpdateStudyAction(studyId, data)}
            onError={(e) => console.warn(e)}
        >
            <Text size="xl" ta="left" mb={30}>
                STUDY Proposal Form
            </Text>
            <Text size="xl" ta="left">
                STUDY DETAILS
            </Text>

            <Flex p={2} gap="md" wrap="wrap">
                <Text className={labelStyle}>Study Title</Text>
                <TextInput className={inputStyle} name="title" data-testid="study-title" control={control} readOnly />
            </Flex>

            <Flex p={2} gap="md" wrap="wrap">
                <Text className={labelStyle}>Study Description</Text>
                <Textarea className={inputStyle} name="description" label="" control={control} />
            </Flex>

            <Flex p={2} gap="md">
                <Text className={labelStyle}>Principal Investigator</Text>
                <TextInput className={inputStyle} name="piName" control={control} />
            </Flex>

            <Text size="xl" ta="left" mt={50}>
                REQUESTED DATA DETAILS
            </Text>
            <Stack align="stretch">
                <Flex p={2} gap="lg">
                    <Text className={labelStyle}>Datasets of Interest</Text>
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
                </Flex>
                <Flex p={2} gap="lg">
                    <Text className={labelStyle}>Data Format</Text>
                    <Select
                        className={inputStyle}
                        name="outputMimeType"
                        control={control}
                        data={[{ value: 'text/csv', label: 'CSV' }]}
                    />
                </Flex>
            </Stack>

            <Flex mt={30} justify="flex-end">
                <Button type="submit" variant="default">
                    Update Proposal
                </Button>
            </Flex>
        </HookForm>
    )
}
