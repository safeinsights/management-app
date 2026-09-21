import type { Story } from '@ladle/react'
import { useDisclosure } from '@mantine/hooks'
import { pageBackgroundArgTypes } from '~ladle/backgrounds'
import { RegenerateKeyView } from './regenerate-key-view'

const meta = { title: 'Pages / Security key', argTypes: pageBackgroundArgTypes }
export default meta

export const KeyAlreadyExists: Story = () => {
    const [isModalOpen, { open, close }] = useDisclosure(false)
    return (
        <RegenerateKeyView
            generatedOn="Jul 08, 2026"
            isModalOpen={isModalOpen}
            onOpenModal={open}
            onCloseModal={close}
            onConfirmGenerate={close}
        />
    )
}

export const ConfirmKeyResetModal: Story = () => {
    const [isModalOpen, { open, close }] = useDisclosure(true)
    return (
        <RegenerateKeyView
            generatedOn="Jul 08, 2026"
            isModalOpen={isModalOpen}
            onOpenModal={open}
            onCloseModal={close}
            onConfirmGenerate={close}
        />
    )
}
