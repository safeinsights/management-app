'use client'

import type { FC } from '@/common'
import { legalDocumentCollectionLabels, legalDocumentTypeLabels } from '@/schema/legal-document'
import { Tabs } from '@mantine/core'
import { TosPnPanel } from './tos-pn/tos-pn'
import { ParticipationAgreements } from './participation/participation-agreements'
import { StudyAgreements } from './study-agreement/study-agreements'

export const LegalTabs: FC = () => (
    <Tabs defaultValue="TOS" keepMounted={false}>
        <Tabs.List>
            <Tabs.Tab value="TOS">{legalDocumentTypeLabels.TOS}</Tabs.Tab>
            <Tabs.Tab value="PN">{legalDocumentTypeLabels.PN}</Tabs.Tab>
            {/* Acronyms: the full names run to 40+ characters, which no tab strip survives. */}
            <Tabs.Tab value="DOPA">DOPA</Tabs.Tab>
            <Tabs.Tab value="ROPA">ROPA</Tabs.Tab>
            <Tabs.Tab value="SLA">{legalDocumentCollectionLabels.SLA}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="TOS" pt="xl">
            <TosPnPanel doctype="TOS" />
        </Tabs.Panel>
        <Tabs.Panel value="PN" pt="xl">
            <TosPnPanel doctype="PN" />
        </Tabs.Panel>
        <Tabs.Panel value="DOPA" pt="xl">
            <ParticipationAgreements type="DOPA" />
        </Tabs.Panel>
        <Tabs.Panel value="ROPA" pt="xl">
            <ParticipationAgreements type="ROPA" />
        </Tabs.Panel>
        <Tabs.Panel value="SLA" pt="xl">
            <StudyAgreements />
        </Tabs.Panel>
    </Tabs>
)
