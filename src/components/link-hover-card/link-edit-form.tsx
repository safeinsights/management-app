'use client'

import { type KeyboardEvent } from 'react'
import { Button, Group, Stack, TextInput } from '@mantine/core'
import { useForm, zodResolver, z } from '@/common'
import { isValidUrl } from '@/components/editable-text/config'
import { EMPTY_TEXT_MESSAGE, INVALID_URL_MESSAGE, LINK_TEXT_FIELD_LABEL, LINK_URL_FIELD_LABEL } from './copy'

// Refined on the trimmed value rather than trimmed in the schema: the resolver only validates, so
// `transformValues` is what decides the values the save receives.
const linkEditSchema = z.object({
    text: z.string().refine((value) => value.trim().length > 0, EMPTY_TEXT_MESSAGE),
    url: z.string().refine((value) => isValidUrl(value.trim()), INVALID_URL_MESSAGE),
})

export type LinkEditValues = z.infer<typeof linkEditSchema>

const trimValues = ({ text, url }: LinkEditValues): LinkEditValues => ({ text: text.trim(), url: url.trim() })

function useLinkEditForm({
    initialText,
    initialUrl,
    onSave,
}: {
    initialText: string
    initialUrl: string
    onSave: (values: LinkEditValues) => void
}) {
    const form = useForm<LinkEditValues>({
        initialValues: { text: initialText, url: initialUrl },
        validate: zodResolver(linkEditSchema),
        transformValues: trimValues,
    })

    // Mantine hands the submit event along as a second argument; the caller only wants values.
    const handleSubmit = form.onSubmit((values) => onSave(values))
    const submit = () => handleSubmit()

    // The card sits inside the field it edits, so there is no form element to submit into.
    const submitOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key !== 'Enter') return
        event.preventDefault()
        submit()
    }

    return { form, submit, submitOnEnter }
}

interface LinkEditFormProps {
    initialText: string
    initialUrl: string
    textInputRef?: React.Ref<HTMLInputElement>
    onCancel: () => void
    onSave: (values: LinkEditValues) => void
}

export function LinkEditForm({ initialText, initialUrl, textInputRef, onCancel, onSave }: LinkEditFormProps) {
    const { form, submit, submitOnEnter } = useLinkEditForm({ initialText, initialUrl, onSave })

    return (
        <Stack gap="sm">
            <TextInput
                ref={textInputRef}
                label={LINK_TEXT_FIELD_LABEL}
                key={form.key('text')}
                {...form.getInputProps('text')}
                onKeyDown={submitOnEnter}
                data-autofocus
            />
            <TextInput
                label={LINK_URL_FIELD_LABEL}
                key={form.key('url')}
                {...form.getInputProps('url')}
                onKeyDown={submitOnEnter}
            />
            <Group gap="md" justify="flex-end">
                <Button variant="subtle" color="navy" size="compact-sm" onClick={onCancel}>
                    Cancel
                </Button>
                <Button color="navy" size="compact-sm" onClick={submit}>
                    Save
                </Button>
            </Group>
        </Stack>
    )
}
