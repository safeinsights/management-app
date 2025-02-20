'use client'

import {
    FileJs,
    Folder,
    FolderOpen,
    FileCss,
    TreeStructure,
    FileTsx,
    File,
    Diamond,
    FileText,
    FileMd,
    FilePy,
} from '@phosphor-icons/react/dist/ssr'
import { ActionIcon, Group, RenderTreeNodePayload, Tree, useTree } from '@mantine/core'
import { Flex } from '@mantine/core'
import type { MinimalJobInfo, CodeManifest, TreeNode } from '@/lib/types'
import { DisplayFile } from './display'
import { expandIconStyle, leftPanelStyles, treeStyles } from './styles.css'
import { ReactNode } from 'react'

interface FileIconProps {
    name: string
    isFolder: boolean
    expanded: boolean
}

const Icons: [RegExp, ReactNode][] = [
    [/\.(ts|tsx|tsconfig(\.json)?)$/, <FileTsx key="ts" />],
    [/\.(css|scss|sass)$/, <FileCss key="css" />],
    [/\.(js|jsx)$/, <FileJs key="js" />],
    [/\.r$/i, <File key="j" />],
    [/package\.json$/, <File key="npm" />],
    [/\.rb$/i, <Diamond color="red" key="ruby" />],
    [/\.txt$/i, <FileText key="txt" />],
    [/\.md$/i, <FileMd key="md" />],
    [/\.py$/i, <FilePy key="py" />],
]

function FileIcon({ name, isFolder, expanded }: FileIconProps) {
    if (isFolder) {
        return expanded ? (
            <FolderOpen color="var(--mantine-color-yellow-9)" size={14} />
        ) : (
            <Folder color="var(--mantine-color-yellow-9)" size={14} />
        )
    }

    return Icons.find(([re]) => re.test(name))?.[1] || null
}

function Leaf({ node, expanded, hasChildren, elementProps }: RenderTreeNodePayload) {
    return (
        <Group gap={5} {...elementProps}>
            <FileIcon name={node.value} isFolder={hasChildren} expanded={expanded} />
            <span>{node.label}</span>
        </Group>
    )
}

export function Files({
    data,
    jobInfo,
    manifest,
    initialExpanded,
}: {
    initialExpanded?: string
    data: TreeNode[]
    jobInfo: MinimalJobInfo
    manifest: CodeManifest
}) {
    const tree = useTree({
        initialExpandedState: initialExpanded ? { [`${initialExpanded}`]: true } : undefined,
    })

    return (
        <Flex gap="md">
            <Flex className={leftPanelStyles} direction="column" px="sm">
                <ActionIcon className={expandIconStyle} title="Expand All" onClick={() => tree.expandAllNodes()}>
                    <TreeStructure />
                </ActionIcon>
                <Tree
                    className={treeStyles}
                    selectOnClick
                    clearSelectionOnOutsideClick
                    data={data}
                    tree={tree}
                    renderNode={(payload) => <Leaf {...payload} />}
                />
            </Flex>
            <DisplayFile path={tree.selectedState[0]} jobInfo={jobInfo} manifest={manifest} />
        </Flex>
    )
}
