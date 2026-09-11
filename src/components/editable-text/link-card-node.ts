import { $findMatchingParent } from '@lexical/utils'
import { $isLinkNode, type LinkAttributes, type LinkNode } from '@lexical/link'
import {
    $createTextNode,
    $getNearestNodeFromDOMNode,
    $getNodeByKey,
    $getSelection,
    $isRangeSelection,
    $isTextNode,
    createCommand,
    type LexicalCommand,
} from 'lexical'

/** Dispatched by the toolbar so the card can open for the link the caret already sits in. */
export const OPEN_LINK_CARD_COMMAND: LexicalCommand<void> = createCommand('OPEN_LINK_CARD_COMMAND')

export interface LinkCardTarget {
    nodeKey: string
    /** Sanitized by the node, so a stored URL with an unsupported protocol reads as `about:blank`. */
    url: string
    target: string | null
    text: string
}

function describeLink(link: LinkNode): LinkCardTarget {
    return {
        nodeKey: link.getKey(),
        url: link.sanitizeUrl(link.getURL()),
        target: link.getTarget(),
        text: link.getTextContent(),
    }
}

export function $linkAtDomNode(domNode: Node): LinkCardTarget | null {
    const node = $getNearestNodeFromDOMNode(domNode)
    if (!node) return null

    const link = $findMatchingParent(node, $isLinkNode)
    return link ? describeLink(link) : null
}

export function $linkAtSelection(): LinkCardTarget | null {
    const selection = $getSelection()
    if (!$isRangeSelection(selection)) return null

    const link = $findMatchingParent(selection.anchor.getNode(), $isLinkNode)
    if (!link) return null
    // A selection spanning out of the link is a text range, not a link the card can act on.
    if ($findMatchingParent(selection.focus.getNode(), $isLinkNode) !== link) return null

    return describeLink(link)
}

/**
 * True only once the caret has moved out of the link. A missing range selection means the editor is
 * blurred, which is the state while the card itself holds focus.
 */
export function $selectionLeftLink(nodeKey: string): boolean {
    const selection = $getSelection()
    if (!$isRangeSelection(selection)) return false

    const link = $findMatchingParent(selection.anchor.getNode(), $isLinkNode)
    return link?.getKey() !== nodeKey
}

export function $updateLink(nodeKey: string, url: string, text: string, attributes: LinkAttributes) {
    const link = $getNodeByKey(nodeKey)
    if (!$isLinkNode(link)) return

    link.setURL(url)
    // Links stored before OTTER-463 carry no target, so saving one brings it up to date.
    link.setTarget(attributes.target ?? null)
    link.setRel(attributes.rel ?? null)

    if (!text || link.getTextContent() === text) return

    const [firstChild, ...rest] = link.getChildren()
    if (rest.length === 0 && $isTextNode(firstChild)) {
        firstChild.setTextContent(text)
        return
    }

    link.clear()
    link.append($createTextNode(text))
}

/** Lifts the link's children out and drops the link, leaving the text where it was. */
export function $unwrapLink(nodeKey: string) {
    const link = $getNodeByKey(nodeKey)
    if (!$isLinkNode(link)) return

    const children = link.getChildren()
    for (const child of children) link.insertBefore(child)
    link.remove()

    const last = children.at(-1)
    if ($isTextNode(last)) last.select(last.getTextContentSize(), last.getTextContentSize())
}

export function $selectLinkEnd(nodeKey: string) {
    const link = $getNodeByKey(nodeKey)
    if ($isLinkNode(link)) link.selectEnd()
}
