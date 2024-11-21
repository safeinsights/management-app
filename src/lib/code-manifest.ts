import { TreeNode, CodeManifest } from './types'

import type { FileWithPath } from '@mantine/dropzone'

export class CodeReviewManifest {
    files: FileWithPath[] = []

    get asTreeNode(): TreeNode {
        const root: TreeNode = {
            label: '',
            value: '',
            size: 0,
            children: [],
        }

        for (const { path, size } of this.files) {
            const parts = path.replace(/^\.?\//, '').split('/')
            let currentNode = root
            let value = ''
            for (let i = 0; i < parts.length; i++) {
                const part = parts[i]
                value = value ? `${value}/${part}` : part
                const isFile = i === parts.length - 1
                let existingNode = currentNode.children!.find((child) => child.label === part)

                if (!existingNode) {
                    existingNode = {
                        value,
                        label: part,
                        size: isFile ? size || 0 : 0,
                        children: isFile ? undefined : [],
                    }
                    currentNode.children!.push(existingNode)
                }

                currentNode = existingNode
            }
        }
        return root
    }

    get asJSON() {
        return JSON.stringify(
            {
                tree: this.asTreeNode,
                files: this.files.reduce(
                    (acc, file) => {
                        acc[file.path.replace(/^\.?\//, '')] = file.size
                        return acc
                    },
                    {} as { [key: string]: number },
                ),
                size: this.files.reduce((acc, f) => acc + f.size, 0),
            },
            null,
            4,
        )
    }
}



export function buildCodeManifest(files: FileWithPath[]): CodeManifest {
    const filesRecord: Record<string, number> = {}
    let totalSize = 0

    const tree: TreeNode = {
        label: '',
        value: '',
        size: 0,
        children: [],
    }

    const addFileToTree = (pathParts: string[], size: number, parent: TreeNode) => {
        const [current, ...rest] = pathParts

        // Find or create the current node
        let currentNode = parent.children?.find((node) => node.label === current)

        if (!currentNode) {
            currentNode = {
                label: current,
                value:  parent.value ? `${parent.value}/${current}` : current,
                size: 0,
                children: [],
            }

            parent.children?.push(currentNode)
        }

        // If there are more parts, recurse; otherwise, set size for the file node
        if (rest.length > 0) {
            addFileToTree(rest, size, currentNode)
        } else {
            currentNode.size = size
        }

        // Update the parent size
        parent.size += size
    }

    for (const file of files) {
        const { name, size } = file

        // Update the files record
        filesRecord[name] = size

        // Update total size
        totalSize += size

        // Split the file path into parts and add it to the tree
        const pathParts = name.split('/') // Adjust based on how paths are represented
        addFileToTree(pathParts, size, tree)
    }

    return {
        files: filesRecord,
        tree,
        size: totalSize,
    }
}
