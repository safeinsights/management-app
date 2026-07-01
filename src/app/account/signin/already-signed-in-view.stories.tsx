import type { Story } from '@ladle/react'
import type { ReactNode } from 'react'
import { Container } from '@mantine/core'
import { focusedBackgroundArgTypes } from '~ladle/backgrounds'
import { AlreadySignedInView } from './already-signed-in-view'

// The card shown when an authenticated user opens the sign-in page. Presentational only.
const meta = { title: 'Pages / Sign in / Already signed in', argTypes: focusedBackgroundArgTypes }
export default meta

const noop = () => {}

function FocusedBackdrop({ children }: { children: ReactNode }) {
    return (
        <div
            style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 24,
            }}
        >
            <Container w={500}>{children}</Container>
        </div>
    )
}

export const WithEmail: Story = () => (
    <FocusedBackdrop>
        <AlreadySignedInView email="ada@example.com" isSwitching={false} onContinue={noop} onSwitchAccount={noop} />
    </FocusedBackdrop>
)

export const WithoutEmail: Story = () => (
    <FocusedBackdrop>
        <AlreadySignedInView email={null} isSwitching={false} onContinue={noop} onSwitchAccount={noop} />
    </FocusedBackdrop>
)

export const SwitchingAccount: Story = () => (
    <FocusedBackdrop>
        <AlreadySignedInView email="ada@example.com" isSwitching={true} onContinue={noop} onSwitchAccount={noop} />
    </FocusedBackdrop>
)
