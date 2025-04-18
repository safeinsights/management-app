import { useState } from 'react'
import { Button, Group, Modal } from '@mantine/core'
import { useRouter } from 'next/navigation'

export function CancelButton({ isDirty }: { isDirty: boolean }) {
    const [opened, setOpened] = useState(false)
    const router = useRouter()

    const handleCancel = () => {
        if (isDirty) {
            setOpened(true)
        } else {
            router.push('/')
        }
    }

    const confirmCancel = async () => {
        router.push('/')
    }

    return (
        <>
            <Modal opened={opened} onClose={() => setOpened(false)} title="Confirm Cancel">
                <p>All progress will be lost if cancelling at this point. Do you still wish to proceed?</p>
                <Group mt="md">
                    <Button variant="subtle" onClick={() => setOpened(false)}>
                        No, keep editing
                    </Button>
                    <Button color="red" onClick={confirmCancel}>
                        Yes, erase draft
                    </Button>
                </Group>
            </Modal>

            <Button type="button" variant="outline" c="purple.5" onClick={handleCancel}>
                Cancel
            </Button>
        </>
    )
}
