'use client'

import type { FC } from '@/common'
import { legalDocumentTypeLabels } from '@/schema/legal-document'
import { Tabs } from '@mantine/core'
import { TosPnPanel } from './tos-pn/tos-pn'
import { ParticipationAgreements } from './participation/participation-agreements'
import { StudyLevelAgreements } from './sla/study-level-agreements'

// keepMounted={false} so a tab's queries only run once its panel is opened.
export const LegalTabs: FC = () => (
    <Tabs defaultValue="TOS" keepMounted={false}>
        <Tabs.List>
            <Tabs.Tab value="TOS">{legalDocumentTypeLabels.TOS}</Tabs.Tab>
            <Tabs.Tab value="PN">{legalDocumentTypeLabels.PN}</Tabs.Tab>
            <Tabs.Tab value="DOPA">DOPA</Tabs.Tab>
            <Tabs.Tab value="ROPA">ROPA</Tabs.Tab>
            <Tabs.Tab value="SLA">Study Level Agreements</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="TOS" pt="md">
            <TosPnPanel doctype="TOS" />
        </Tabs.Panel>
        <Tabs.Panel value="PN" pt="md">
            <TosPnPanel doctype="PN" />
        </Tabs.Panel>
        <Tabs.Panel value="DOPA" pt="md">
            <ParticipationAgreements type="DOPA" />
        </Tabs.Panel>
        <Tabs.Panel value="ROPA" pt="md">
            <ParticipationAgreements type="ROPA" />
        </Tabs.Panel>
        <Tabs.Panel value="SLA" pt="md">
            <StudyLevelAgreements />
        </Tabs.Panel>
    </Tabs>
)
