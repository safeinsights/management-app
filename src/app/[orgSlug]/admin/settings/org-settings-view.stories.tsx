import type { Story } from '@ladle/react'
import { ActionIcon, Anchor, Box, Stack, Text, Tooltip } from '@mantine/core'
import { PencilIcon, TrashIcon } from '@phosphor-icons/react/dist/ssr'
import type { Org } from '@/schema/org'
import { OrgSettingsView } from './org-settings-view'
import { CodeEnvRowView, CodeEnvsView } from './code-envs-view'
import { DataSourceRowView, DataSourcesView } from './data-sources-view'

// The org-admin Settings page-view. Every container piece is presentational here: the
// About card is the real OrganizationSettingsDisplay, and the Code Environments / Data
// Sources cards are the real shells with rows fed inline fixtures. Action controls
// (edit / delete) are plain stand-ins since the live mutations live in the containers.
const meta = { title: 'Pages / Org settings' }
export default meta

const org: Org = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Mars University',
    slug: 'mars-university',
    email: 'admin@mars.example',
    description: 'Interplanetary research enclave studying long-term habitation outcomes.',
    type: 'enclave',
    settings: { publicKey: 'pub-key' },
    createdAt: new Date('2026-01-04'),
    updatedAt: new Date('2026-05-01'),
}

const noop = () => {}

const RowActions = (
    <>
        <Tooltip label="Edit" withArrow>
            <ActionIcon size="sm" variant="subtle" color="green" onClick={noop} aria-label="Edit">
                <PencilIcon />
            </ActionIcon>
        </Tooltip>
        <ActionIcon size="sm" variant="subtle" color="red" onClick={noop} aria-label="Delete">
            <TrashIcon />
        </ActionIcon>
    </>
)

const CodeEnvsCard = (
    <CodeEnvsView
        onAdd={noop}
        refresher={
            <Text fz="sm" c="dimmed">
                Reload inactive, nothing needs refreshing
            </Text>
        }
    >
        <Stack gap={0}>
            <CodeEnvRowView
                name="Base R environment"
                language="R"
                isTesting={false}
                isDefault
                latestScanStatus="SCAN-COMPLETE"
                detailOpened={false}
                onToggleDetail={noop}
                onLanguageBadgeClick={noop}
                onScanBadgeClick={noop}
                actions={RowActions}
                detail={null}
            />
            <CodeEnvRowView
                name="Python sandbox"
                language="PYTHON"
                isTesting
                isDefault={false}
                latestScanStatus="SCAN-RUNNING"
                detailOpened={false}
                onToggleDetail={noop}
                onLanguageBadgeClick={noop}
                onScanBadgeClick={noop}
                actions={RowActions}
                detail={null}
            />
        </Stack>
    </CodeEnvsView>
)

const DataSourcesCard = (
    <DataSourcesView onAdd={noop}>
        <Stack gap={0}>
            <DataSourceRowView
                name="Census microdata"
                codeEnvNames="Base R environment"
                description="De-identified population survey extracts, refreshed quarterly."
                urls={[
                    {
                        id: 'url-1',
                        url: 'https://data.example.com/census',
                        description: 'Primary catalog',
                    },
                ]}
                actions={RowActions}
            />
        </Stack>
    </DataSourcesView>
)

export const Populated: Story = () => (
    <Box style={{ maxWidth: 960, margin: '0 auto' }}>
        <OrgSettingsView org={org} onStartEditOrg={noop} codeEnvs={CodeEnvsCard} dataSources={DataSourcesCard} />
    </Box>
)

export const EmptyCards: Story = () => (
    <Box style={{ maxWidth: 960, margin: '0 auto' }}>
        <OrgSettingsView
            org={{ ...org, description: null }}
            onStartEditOrg={noop}
            codeEnvs={
                <CodeEnvsView onAdd={noop}>
                    <Text fz="sm" c="dimmed" ta="center" p="md">
                        No code environments available.
                    </Text>
                </CodeEnvsView>
            }
            dataSources={
                <DataSourcesView onAdd={noop}>
                    <Text fz="sm" c="dimmed" ta="center" p="md">
                        No data sources available.
                    </Text>
                </DataSourcesView>
            }
        />
    </Box>
)

// The Data Sources card on its own, showing a linked external URL row.
export const DataSourcesCardOnly: Story = () => (
    <Box style={{ maxWidth: 960, margin: '24px auto' }}>
        <DataSourcesView onAdd={noop}>
            <Stack gap={0}>
                <DataSourceRowView
                    name="Climate readings"
                    codeEnvNames="Python sandbox"
                    description="Hourly sensor telemetry."
                    urls={[
                        { id: 'u1', url: 'https://data.example.com/climate', description: 'Sensor feed' },
                        { id: 'u2', url: null, description: 'placeholder (hidden when url is null)' },
                    ]}
                    actions={
                        <Anchor href="#" fz="sm">
                            Manage
                        </Anchor>
                    }
                />
            </Stack>
        </DataSourcesView>
    </Box>
)
