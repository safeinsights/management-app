import { PushInstructions } from '@/components/push-instructions'
import { Modal } from '@mantine/core'

export const PushInstructionsModal: React.FC<{
    containerLocation: string
    runId: string | null
    onComplete(): void
}> = ({ onComplete, containerLocation, runId }) => {
    return (
        <Modal opened={!!runId} onClose={onComplete} size="xl">
            {runId && <PushInstructions runId={runId} containerLocation={containerLocation} />}
        </Modal>
    )
}
