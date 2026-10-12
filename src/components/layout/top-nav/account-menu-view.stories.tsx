import type { Story } from '@ladle/react'
import { useRef, useState } from 'react'
import { Text } from '@mantine/core'
import { FileTextIcon, GearSixIcon, LockIcon, SignOutIcon, UserIcon } from '@phosphor-icons/react/dist/ssr'
import { Routes } from '@/lib/routes'
import { WithAppShell } from '~ladle/decorators/with-app-shell'
import { navIcon } from '../nav-icon'
import { AccountMenuView, type AccountMenuItem } from './account-menu-view'
import styles from './top-nav.module.css'

const meta = { title: 'Layout / Top Nav' }
export default meta

const SECTIONS: AccountMenuItem[][] = [
    [
        { label: 'Professional profile', icon: navIcon(UserIcon), href: Routes.researcherProfile },
        { label: 'Settings', icon: navIcon(GearSixIcon) },
        { label: 'Security key', icon: navIcon(LockIcon), href: Routes.userKey },
        { label: 'Legal', icon: navIcon(FileTextIcon), href: Routes.legal, isCurrent: true },
    ],
    [{ label: 'Log out', icon: navIcon(SignOutIcon) }],
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
            initials="DK"
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
