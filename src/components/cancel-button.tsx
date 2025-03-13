import { useState } from 'react'
import { Button, Modal, Group, Loader } from '@mantine/core'
import { useRouter } from 'next/navigation'

export function CancelButton({ isDirty, uploadedFiles }: { isDirty: boolean; uploadedFiles: File[] }) {
    const [opened, setOpened] = useState(false)
    const [loading, setLoading] = useState(false)
    const router = useRouter()

    const handleCancel = () => {
        if (isDirty) {
            setOpened(true)
        } else {
            router.push('/')
        }
    }

    const confirmCancel = async () => {
        setLoading(true)
        try {
            if (uploadedFiles.length > 0) {
                const uploadedFile = uploadedFiles[0].name
                await fetch('/api/delete-file', {
                    method: 'DELETE',
                    body: JSON.stringify({ filePath: uploadedFile }),
                    headers: { 'Content-Type': 'application/json' },
                })
            }
        } catch (error) {
            console.error('Error deleting file:', error)
        } finally {
            setLoading(false)
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
                    <Button color="red" onClick={confirmCancel} disabled={loading}>
                        {loading ? <Loader size="xs" /> : 'Yes, erase draft'}
                    </Button>
                </Group>
            </Modal>

            <Button fz="lg" mb="lg" type="button" variant="outline" color="#616161" onClick={handleCancel}>
                Cancel
            </Button>
        </>
    )
}
