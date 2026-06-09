import type { Story } from '@ladle/react'
import { Text } from '@mantine/core'
import { Panel, SuccessPanel, ErrorPanel } from './panel'

const meta = { title: 'Feedback / Panel' }
export default meta

export const Default: Story = () => (
    <div style={{ padding: 24, maxWidth: 760 }}>
        <Panel title="Study details">
            <Text>This is the body of a panel. It can hold any content beneath the titled header bar.</Text>
        </Panel>
    </div>
)

export const LongTitleAndContent: Story = () => (
    <div style={{ padding: 24, maxWidth: 760 }}>
        <Panel title="A considerably longer panel title that describes the contents of this particular section in detail">
            <Text>
                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et
                dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip
                ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu
                fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia
                deserunt mollit anim id est laborum.
            </Text>
        </Panel>
    </div>
)

export const Success: Story = () => (
    <div style={{ padding: 24, maxWidth: 760 }}>
        <SuccessPanel title="Your study was submitted successfully" onContinue={() => alert('continue')}>
            Continue to dashboard
        </SuccessPanel>
    </div>
)

export const SuccessLongContent: Story = () => (
    <div style={{ padding: 24, maxWidth: 760 }}>
        <SuccessPanel
            title="Your study proposal has been received and is now awaiting reviewer approval"
            onContinue={() => alert('continue')}
        >
            Return to the dashboard to track its progress
        </SuccessPanel>
    </div>
)

export const Error: Story = () => (
    <div style={{ padding: 24, maxWidth: 760 }}>
        <ErrorPanel title="Something went wrong" onContinue={() => alert('continue')}>
            Try again
        </ErrorPanel>
    </div>
)

export const ErrorLongContent: Story = () => (
    <div style={{ padding: 24, maxWidth: 760 }}>
        <ErrorPanel
            title="We were unable to submit your study because of an unexpected server error"
            onContinue={() => alert('continue')}
        >
            Go back and try submitting again
        </ErrorPanel>
    </div>
)
