import { useState } from 'react'
import { Button, Text, Stack, Group } from '@mantine/core'
import { useRouter } from 'next/navigation'
import { AppModal } from '@/components/modal'

export function CancelButton({ isDirty }: { isDirty: boolean }) {
    const [isOpen, setIsOpen] = useState(false)
    const router = useRouter()

    const handleCancel = () => {
        if (isDirty) {
            setIsOpen(true)
        } else {
            router.push('/')
        }
    }

    const confirmCancel = async () => {
        router.push('/')
    }

    return (
        <>
            <AppModal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Cancel proposal?">
                <Stack>
                    <Text size="md">
                        You&apos;re about to cancel this study proposal draft. On cancel, the current proposal will be
                        deleted and you won&apos;t be able to retrieve it in the future.
                    </Text>
                    <Text size="md">Do you want to proceed?</Text>
                    <Group>
                        <Button variant="outline" onClick={() => setIsOpen(false)}>
                            Back to proposal
                        </Button>
                        <Button variant="filled" color="red.7" onClick={confirmCancel}>
                            Yes, delete proposal
                        </Button>
                    </Group>
                </Stack>
            </AppModal>

            <Button type="button" variant="outline" c="purple.5" onClick={handleCancel}>
                Cancel
            </Button>
        </>
    )
}
