import { useState } from 'react'
import { Button, Modal, Group } from '@mantine/core'
import { useForm } from '@mantine/form'
import { useRouter } from 'next/navigation'

export function CancelButton({ form }: { form: ReturnType<typeof useForm> }) {
    const [opened, setOpened] = useState(false)
    const router = useRouter()

    const handleCancel = () => {
        if (form.isDirty()) {
            setOpened(true)
        } else {
            router.push('/') 
        }
    }

    return (
        <>
            <Modal opened={opened} onClose={() => setOpened(false)} title="Confirm Cancel">
                <p>All progress will be lost if cancelling at this point. Do you still wish to proceed?</p>
                <Group mt="md">
                    <Button variant="subtle" onClick={() => setOpened(false)}>
                        No, keep editing
                    </Button>
                    <Button color="red" onClick={() => router.push('/dashboard')}>
                        Yes, erase draft
                    </Button>
                </Group>
            </Modal>

            <Button fz="lg" mb={20} w={248} type="button" variant="outline" color="#616161" onClick={handleCancel}>
                Cancel
            </Button>
        </>
    )
}
