'use client'

import type { ReactNode } from 'react'
import type { Route } from 'next'
import { Divider, Flex, Group, Paper, Stack, Table, TableTbody, Text, Title } from '@mantine/core'
import { PlusIcon } from '@phosphor-icons/react/dist/ssr'
import { ButtonLink } from '@/components/links'
import { ErrorAlert } from '@/components/errors'
import { TableHeader } from './columns'
import { EmptyState } from './empty-state'
import { Audience, Scope, StudyRow as StudyRowType } from './types'

// Presentational dashboard table. It owns the header (title / actions / refresher / CTA),
// the table chrome, and the error/empty/populated states — but NOT data fetching or the
// session. Rows are supplied via `renderRow` so the session-dependent action link
// (StudyActionLink) stays in the data container; in isolation (e.g. Ladle) a story passes
// a plain link instead. The StudiesTable container (./index) provides the real ones.
export type StudiesTableViewProps = {
    studies: StudyRowType[]
    audience: Audience
    scope: Scope
    title?: string
    description?: string
    /** When set, renders the "Propose New Study" CTA pointing here. */
    newStudyHref?: Route
    headerActions?: ReactNode
    /** Data-driven refresher control, injected by the container. */
    refresher?: ReactNode
    isError?: boolean
    errorMessage?: string
    paperWrapper?: boolean
    renderRow: (study: StudyRowType) => ReactNode
}

export function StudiesTableView({
    studies,
    audience,
    scope,
    title,
    description,
    newStudyHref,
    headerActions,
    refresher,
    isError = false,
    errorMessage = '',
    paperWrapper = false,
    renderRow,
}: StudiesTableViewProps) {
    let body: ReactNode
    if (isError) {
        body = <ErrorAlert error={`Failed to load studies: ${errorMessage}`} />
    } else if (studies.length === 0) {
        body = <EmptyState audience={audience} scope={scope} />
    } else {
        body = (
            <Table layout="fixed" verticalSpacing="md" highlightOnHover stickyHeader>
                <TableHeader audience={audience} scope={scope} />
                <TableTbody>{studies.map(renderRow)}</TableTbody>
            </Table>
        )
    }

    // The header always renders so dual-role users keep their audience toggle even when the
    // selected role has no studies; only the body reflects error / empty / populated state.
    const content = (
        <Stack>
            <Group justify="space-between" align="center">
                {title && <Title order={3}>{title}</Title>}
                <Flex justify="flex-end" align="center" gap="md">
                    {headerActions}
                    {refresher}
                    {newStudyHref && (
                        <ButtonLink leftSection={<PlusIcon />} data-testid="new-study" href={newStudyHref}>
                            Propose New Study
                        </ButtonLink>
                    )}
                </Flex>
            </Group>
            <Divider c="charcoal.1" />
            {description && <Text mb="md">{description}</Text>}
            {body}
        </Stack>
    )

    if (paperWrapper) {
        return (
            <Paper shadow="xs" p="xxl">
                {content}
            </Paper>
        )
    }

    return content
}
