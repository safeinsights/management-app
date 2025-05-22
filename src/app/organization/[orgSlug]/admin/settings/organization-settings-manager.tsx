'use client'

import { Paper } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { OrganizationSettingsEdit } from './organization-settings-edit'
import { OrganizationSettingsDisplay } from './organization-settings-display'
import { type Org } from '@/schema/org'

interface OrganizationSettingsManagerProps {
    org: Org
}

export function OrganizationSettingsManager({ org }: OrganizationSettingsManagerProps) {
    const [isEditing, { open: startEdit, close: cancelEdit }] = useDisclosure(false)

    return (
        <Paper shadow="xs" p="xl" mb="xl">
            {isEditing ? (
                <OrganizationSettingsEdit org={org} onSaveSuccess={cancelEdit} onCancel={cancelEdit} />
            ) : (
                <OrganizationSettingsDisplay org={org} onStartEdit={startEdit} />
            )}
        </Paper>
    )
}
