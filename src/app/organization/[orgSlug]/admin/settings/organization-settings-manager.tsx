'use client'

import { Transition } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { OrganizationSettingsEdit } from './organization-settings-edit'
import { OrganizationSettingsDisplay } from './organization-settings-display'
import { type Org } from '@/schema/org'

interface OrganizationSettingsManagerProps {
    org: Org
}

export function OrganizationSettingsManager({ org }: OrganizationSettingsManagerProps) {
    const [isEditing, { open: startEdit, close: cancelEdit }] = useDisclosure(false)

    const handleSaveSuccess = () => {
        cancelEdit()
    }

    return (
        <div style={{ position: 'relative' }}>
            <Transition mounted={!isEditing} transition="fade" duration={150}>
                {(styles) => (
                    <div style={{ ...styles, position: isEditing ? 'absolute' : 'relative', inset: 0 }}>
                        <OrganizationSettingsDisplay org={org} onStartEdit={startEdit} />
                    </div>
                )}
            </Transition>

            <Transition mounted={isEditing} transition="fade" duration={150}>
                {(styles) => (
                    <div style={{ ...styles, position: isEditing ? 'relative' : 'absolute', inset: 0 }}>
                        <OrganizationSettingsEdit org={org} onSaveSuccess={handleSaveSuccess} onCancel={cancelEdit} />
                    </div>
                )}
            </Transition>
        </div>
    )
}
