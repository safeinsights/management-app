import type { Story } from '@ladle/react'
import { type ReactNode, useState } from 'react'
import { ActionIcon, Box, Button, Select } from '@mantine/core'
import { PlusIcon, XIcon } from '@phosphor-icons/react/dist/ssr'
import { AppModal } from '@/components/modals/app-modal'
import { PERMISSION_LABELS, permissionLabelForUser } from '@/lib/role'
import type { OrgUserReturn } from '@/server/actions/org.actions'
import { pageBackgroundArgTypes } from '~ladle/backgrounds'
import { ManageTeamView } from './manage-team-view'
import { UsersTableView } from './users-table-view'
import { InviteFormView } from './invite-form-view'
import { PendingInvitesView } from './pending-invites-view'

// The org-admin Manage team page-view. UsersTableView, InviteFormView and
// PendingInvitesView are all presentational; the live mutations / session live in the
// containers. Stories feed inline fixtures and stand-in action controls.
const meta = { title: 'Pages / Manage team', argTypes: pageBackgroundArgTypes }
export default meta

const user = (o: Partial<OrgUserReturn> = {}): OrgUserReturn => ({
    id: '11111111-1111-4111-8111-111111111111',
    fullName: 'Ada Lovelace',
    email: 'ada@mars.example',
    createdAt: new Date('2026-01-04'),
    orgUserId: 'ou-1',
    isAdmin: false,
    orgType: 'enclave',
    latestActivityAt: new Date('2026-05-21T14:32:00'),
    ...o,
})

const people: OrgUserReturn[] = [
    user({ id: 'u1', fullName: 'Ada Lovelace', email: 'ada@mars.example', isAdmin: true }),
    user({ id: 'u2', fullName: 'Grace Hopper', email: 'grace@mars.example', isAdmin: false }),
    user({
        id: 'u3',
        fullName: 'Katherine Johnson',
        email: 'katherine@mars.example',
        isAdmin: false,
        latestActivityAt: null,
    }),
]

const noop = () => {}

// A non-mutating stand-in for the container's PermissionSelector.
const PermissionStandIn = (u: OrgUserReturn) => (
    <Select value={permissionLabelForUser(u)} data={PERMISSION_LABELS} onChange={noop} placeholder="Pick value" />
)

const InviteButtonStandIn = (
    <Button leftSection={<PlusIcon />} onClick={noop}>
        Invite People
    </Button>
)

const TableStandIn = (records: OrgUserReturn[]) => (
    <UsersTableView
        users={records}
        sort={{ columnAccessor: 'fullName', direction: 'asc' }}
        onSortChange={noop}
        renderPermission={PermissionStandIn}
    />
)

export const WithPeople: Story = () => (
    <Box style={{ maxWidth: 960, margin: '0 auto', padding: 16 }}>
        <ManageTeamView inviteAction={InviteButtonStandIn} table={TableStandIn(people)} />
    </Box>
)

export const EmptyTeam: Story = () => (
    <Box style={{ maxWidth: 960, margin: '0 auto', padding: 16 }}>
        <ManageTeamView inviteAction={InviteButtonStandIn} table={TableStandIn([])} />
    </Box>
)

// Stand-in re-invite / revoke controls (the container injects the mutating versions).
const PendingActions = (
    <>
        <Button variant="outline" size="xs" onClick={noop}>
            Re-invite
        </Button>
        <ActionIcon variant="default" onClick={noop} title="Revoke invite">
            <XIcon size={12} />
        </ActionIcon>
    </>
)

const InviteModalBody = (
    <>
        <InviteFormView
            onSubmit={(e) => e.preventDefault()}
            emailProps={{ value: '', onChange: noop }}
            permissionProps={{ value: 'contributor', onChange: noop }}
            isSubmitting={false}
            isSubmitDisabled={false}
        />
        <PendingInvitesView
            pendingUsers={[
                { id: 'p1', email: 'pending.one@mars.example' },
                { id: 'p2', email: 'pending.two@mars.example' },
            ]}
            renderActions={() => PendingActions}
        />
    </>
)

// The modal portals into the document body, so each story drives it from a trigger button with
// real open/close state — that way the X, Escape and overlay-click actually dismiss it (an
// always-open `onClose={noop}` modal can't be escaped).
function InviteModalStory({ children }: { children: ReactNode }) {
    const [open, setOpen] = useState(true)
    return (
        <div style={{ padding: 24 }}>
            <Button leftSection={<PlusIcon />} onClick={() => setOpen(true)}>
                Invite People
            </Button>
            <AppModal
                isOpen={open}
                onClose={() => setOpen(false)}
                title="Invite others to join your team"
                size="lg"
            >
                {children}
            </AppModal>
        </div>
    )
}

export const InviteModalOpen: Story = () => <InviteModalStory>{InviteModalBody}</InviteModalStory>

export const InviteModalEmptyPending: Story = () => (
    <InviteModalStory>
        <InviteFormView
            onSubmit={(e) => e.preventDefault()}
            emailProps={{ value: '', onChange: noop }}
            permissionProps={{ value: '', onChange: noop }}
            isSubmitting={false}
            isSubmitDisabled
        />
        <PendingInvitesView pendingUsers={[]} renderActions={() => PendingActions} />
    </InviteModalStory>
)
