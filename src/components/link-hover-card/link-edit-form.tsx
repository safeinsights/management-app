'use client'

import { useState, type KeyboardEvent } from 'react'
import { Button, Group, Stack, TextInput } from '@mantine/core'
import { InputError } from '@/components/errors'
import { isValidUrl } from '@/components/editable-text/config'
import { INVALID_URL_MESSAGE, LINK_TEXT_FIELD_LABEL, LINK_URL_FIELD_LABEL } from './copy'

export interface LinkEditValues {
    text: string
    url: string
}

function useLinkEditForm({
    initialText,
    initialUrl,
    onSave,
}: {
    initialText: string
    initialUrl: string
    onSave: (values: LinkEditValues) => void
}) {
    const [text, setText] = useState(initialText)
    const [url, setUrl] = useState(initialUrl)
    const [error, setError] = useState<string | null>(null)

    const changeUrl = (value: string) => {
        setUrl(value)
        setError(null)
    }

    const submit = () => {
        const trimmedUrl = url.trim()
        if (!isValidUrl(trimmedUrl)) {
            setError(INVALID_URL_MESSAGE)
            return
        }

        onSave({ text: text.trim(), url: trimmedUrl })
    }

    return { text, setText, url, changeUrl, error, submit }
}

interface LinkEditFormProps {
    initialText: string
    initialUrl: string
    textInputRef?: React.Ref<HTMLInputElement>
    onCancel: () => void
    onSave: (values: LinkEditValues) => void
}

export function LinkEditForm({ initialText, initialUrl, textInputRef, onCancel, onSave }: LinkEditFormProps) {
    const form = useLinkEditForm({ initialText, initialUrl, onSave })

    const submitOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key !== 'Enter') return
        event.preventDefault()
        form.submit()
    }

    const errorMessage = form.error ? <InputError error={form.error} /> : undefined

    return (
        <Stack gap="sm">
            <TextInput
                ref={textInputRef}
                label={LINK_TEXT_FIELD_LABEL}
                value={form.text}
                onChange={(event) => form.setText(event.currentTarget.value)}
                onKeyDown={submitOnEnter}
                data-autofocus
            />
            <TextInput
                label={LINK_URL_FIELD_LABEL}
                value={form.url}
                onChange={(event) => form.changeUrl(event.currentTarget.value)}
                onKeyDown={submitOnEnter}
                error={errorMessage}
            />
            <Group gap="md" justify="flex-end">
                <Button variant="subtle" color="navy" size="compact-sm" onClick={onCancel}>
                    Cancel
                </Button>
                <Button color="navy" size="compact-sm" onClick={form.submit}>
                    Save
                </Button>
            </Group>
        </Stack>
    )
}
