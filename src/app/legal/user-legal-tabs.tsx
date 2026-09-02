'use client'

import type { FC } from '@/common'
import { legalDocumentTypeLabels } from '@/schema/legal-document'
import { Tabs } from '@mantine/core'
import { UserStudyAgreements } from './user-study-agreements'
import { UserParticipationAgreements } from './user-participation-agreements'
import { UserGlobalDocument } from './user-global-document'

// All five regardless of membership, so the strip's shape does not depend on the user's orgs.
// keepMounted={false} so each panel's query, and the two S3 reads behind tos/pn, wait for a click.
export const UserLegalTabs: FC = () => (
    <Tabs defaultValue="SLA" keepMounted={false}>
        <Tabs.List>
            <Tabs.Tab value="SLA">{legalDocumentTypeLabels.SLA}</Tabs.Tab>
            <Tabs.Tab value="DOPA">{legalDocumentTypeLabels.DOPA}</Tabs.Tab>
            <Tabs.Tab value="ROPA">{legalDocumentTypeLabels.ROPA}</Tabs.Tab>
            <Tabs.Tab value="TOS">{legalDocumentTypeLabels.TOS}</Tabs.Tab>
            <Tabs.Tab value="PN">{legalDocumentTypeLabels.PN}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="SLA" pt="md">
            <UserStudyAgreements />
        </Tabs.Panel>
        <Tabs.Panel value="DOPA" pt="md">
            <UserParticipationAgreements type="DOPA" />
        </Tabs.Panel>
        <Tabs.Panel value="ROPA" pt="md">
            <UserParticipationAgreements type="ROPA" />
        </Tabs.Panel>
        <Tabs.Panel value="TOS" pt="md">
            <UserGlobalDocument type="TOS" />
        </Tabs.Panel>
        <Tabs.Panel value="PN" pt="md">
            <UserGlobalDocument type="PN" />
        </Tabs.Panel>
    </Tabs>
)
