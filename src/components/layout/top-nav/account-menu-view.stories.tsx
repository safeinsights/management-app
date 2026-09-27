import type { Story } from '@ladle/react'
import { useRef, useState } from 'react'
import { Avatar, Text } from '@mantine/core'
import { FileTextIcon, GearSixIcon, LockIcon, SignOutIcon, UserIcon } from '@phosphor-icons/react/dist/ssr'
import { semanticColor } from '@/theme/tokens'
import { Routes } from '@/lib/routes'
import { WithAppShell } from '~ladle/decorators/with-app-shell'
import { AccountMenuView, type AccountMenuItem } from './account-menu-view'
import styles from './top-nav.module.css'

const meta = { title: 'Layout / Top Nav' }
export default meta

const ICON_SIZE = 16

const SECTIONS: AccountMenuItem[][] = [
    [
        { label: 'Professional profile', icon: <UserIcon size={ICON_SIZE} />, href: Routes.researcherProfile },
        { label: 'Settings', icon: <GearSixIcon size={ICON_SIZE} /> },
        { label: 'Security key', icon: <LockIcon size={ICON_SIZE} />, href: Routes.userKey },
        { label: 'Legal', icon: <FileTextIcon size={ICON_SIZE} />, href: Routes.legal, isCurrent: true },
    ],
    [{ label: 'Log out', icon: <SignOutIcon size={ICON_SIZE} /> }],
]

// Session-free stand-in for AccountMenu.
function AccountMenuFixture({ defaultOpened = false }: { defaultOpened?: boolean }) {
    const [opened, setOpened] = useState(defaultOpened)
    const triggerRef = useRef<HTMLButtonElement>(null)

    return (
        <AccountMenuView
            opened={opened}
            onToggle={() => setOpened((prev) => !prev)}
            onClose={() => setOpened(false)}
            triggerRef={triggerRef}
            firstName="Devika"
            avatar={
                <Avatar size={32} bg={semanticColor('surface.sidenav')} color={semanticColor('text.white')} name="DK" />
            }
            sections={SECTIONS}
        />
    )
}

const Bar: React.FC<{ defaultOpened?: boolean }> = ({ defaultOpened }) => (
    <nav aria-label="Account" className={styles.bar}>
        <div className={styles.account}>
            <AccountMenuFixture defaultOpened={defaultOpened} />
        </div>
    </nav>
)

export const Closed: Story = () => (
    <WithAppShell header={<Bar />} main={<Text c="dimmed">Page content sits beneath the bar.</Text>}>
        <></>
    </WithAppShell>
)

export const Open: Story = () => (
    <WithAppShell header={<Bar defaultOpened />} main={<Text c="dimmed">Page content sits beneath the bar.</Text>}>
        <></>
    </WithAppShell>
)
