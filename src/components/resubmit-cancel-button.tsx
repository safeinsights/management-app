import { useState } from 'react'
import { Button, Text, Stack, Group } from '@mantine/core'
import { useRouter } from 'next/navigation'
import type { Route } from 'next'
import { AppModal } from '@/components/modal'

export function ResubmitCancelButton({
    isDirty,
    disabled,
    href,
}: {
    isDirty: boolean
    disabled: boolean
    href: string
}) {
    const [isOpen, setIsOpen] = useState(false)
    const router = useRouter()

    const handleCancel = () => {
        if (isDirty) {
            setIsOpen(true)
        } else {
            router.push((href || '/') as Route)
        }
    }

    const confirmCancel = () => {
        router.push((href || '/') as Route)
    }

    return (
        <>
            <AppModal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Are you sure you want to cancel?">
                <Stack>
                    <Text size="md">
                        Canceling now will discard any unsaved changes and uploaded files. This action cannot be undone.
                    </Text>
                    <Group>
                        <Button variant="outline" onClick={() => setIsOpen(false)}>
                            Continue editing
                        </Button>
                        <Button variant="filled" onClick={confirmCancel}>
                            Yes, cancel and discard
                        </Button>
                    </Group>
                </Stack>
            </AppModal>

            <Button type="button" variant="outline" c="purple.5" disabled={disabled} onClick={handleCancel}>
                Cancel
            </Button>
        </>
    )
}
