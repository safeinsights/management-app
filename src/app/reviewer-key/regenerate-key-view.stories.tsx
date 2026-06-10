import type { Story } from '@ladle/react'
import { useDisclosure } from '@mantine/hooks'
import { pageBackgroundArgTypes } from '~ladle/backgrounds'
import { RegenerateKeyView } from './regenerate-key-view'

// The reviewer-key page-view. RegenerateKeyView is presentational; the container derives the
// dashboard crumb from the session and wires navigation. These stories supply inline crumb
// targets and drive the confirm modal with a local useDisclosure (no router/session needed).
//
// Note: this screen only renders the "key already exists" state. The "no key yet" case never
// reaches this component — the route layout redirects to /account/keys when no key exists.
const meta = { title: 'Pages / Reviewer key', argTypes: pageBackgroundArgTypes }
export default meta

export const KeyAlreadyExists: Story = () => {
    const [isModalOpen, { open, close }] = useDisclosure(false)
    return (
        <RegenerateKeyView
            dashboardHref="/openstax/dashboard"
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
            dashboardHref="/openstax/dashboard"
            isModalOpen={isModalOpen}
            onOpenModal={open}
            onCloseModal={close}
            onConfirmGenerate={close}
        />
    )
}
