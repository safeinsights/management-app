'use client'
import { Form as HookForm, useForm } from 'react-hook-form'
import { Text, Button, Flex } from '@mantine/core'
import { onSubmitAction } from './actions'

import { TextInput } from 'react-hook-form-mantine'

import { zodResolver } from '@hookform/resolvers/zod'
import { FormSchemaType, schema } from './schema'

export const Form: React.FC = () => {
    const { control } = useForm<FormSchemaType>({
        resolver: zodResolver(schema),
        defaultValues: {
            title: '',
        },
    })

    return (
        <HookForm control={control} onSubmit={(d) => onSubmitAction(d.data)}>
            <Flex mt="lg" direction="column">
                <Text my="md">By what title shall your study be known?</Text>
                <Flex direction="row" gap="sm">
                    <TextInput name="title" control={control} aria-label="Study Name" style={{ width: 350 }} />
                    <Button type="submit" variant="primary">
                        Let’s Begin
                    </Button>
                </Flex>
            </Flex>
        </HookForm>
    )
}
