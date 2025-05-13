'use client'

import {
    Paper,
    Stack,
    TextInput,
    Textarea,
    Text,
    Group,
    Button,
    Flex,
    Title,
    Divider,
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { zodResolver } from 'mantine-form-zod-resolver'
import { z } from 'zod'

const settingsFormSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    description: z.string().max(250, 'Word limit is 250 characters').optional(),
})
type SettingsFormValues = z.infer<typeof settingsFormSchema>

interface AdminSettingsFormProps {
    orgSlug: string
    initialName: string | null
    initialDescription: string | null
}

export function AdminSettingsForm({ orgSlug, initialName, initialDescription }: AdminSettingsFormProps) {
    const form = useForm<SettingsFormValues>({
        initialValues: {
            name: initialName || '',
            description: initialDescription || '',
        },
        validate: zodResolver(settingsFormSchema),
    })

    const handleSubmit = async (values: SettingsFormValues) => {
        console.log('Form values to save:', values, orgSlug)
    }

    return (
        <Paper shadow="xs" p="xl" mb="xl">
            <form onSubmit={form.onSubmit(handleSubmit)}>
                <Flex direction="row" justify={'space-between'} align="center" mb="lg">
                    <Title order={3}>About organization</Title>
                    <Group justify="flex-end">
                        <Button variant="outline" onClick={() => form.reset()} disabled={!form.isDirty()}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={!form.isDirty() || !form.isValid()}>
                            Save
                        </Button>
                    </Group>
                </Flex>
                <Divider />
                <Stack gap="md" mt="lg">
                    <TextInput
                        label="Name"
                        withAsterisk
                        required
                        aria-required="true"
                        key={form.key('name')}
                        {...form.getInputProps('name')}
                    />
                    <Textarea
                        label="Description"
                        maxLength={250}
                        key={form.key('description')}
                        {...form.getInputProps('description')}
                    />
                    <Text size="xs" color="dimmed">
                        {form.values.description?.length ?? 0}/250 characters
                    </Text>
                </Stack>
            </form>
        </Paper>
    )
}
