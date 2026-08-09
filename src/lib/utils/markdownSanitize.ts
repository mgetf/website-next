/**
 * rehype plugin that strips dangerous URLs from markdown-rendered HTML.
 */

import { visit } from 'unist-util-visit';
import { isSafeUrl } from '$lib/utils/safeUrl';

type HastNode = {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
};

/**
 * rehype plugin: neutralize unsafe href/src on anchors and images.
 */
export function rehypeSanitizeUrls() {
  return (tree: HastNode) => {
    visit(tree, 'element', (node: HastNode) => {
      if (!node.properties) return;

      if (node.tagName === 'a' && typeof node.properties.href === 'string') {
        if (!isSafeUrl(node.properties.href)) {
          node.properties.href = '#';
        }
      }

      if (node.tagName === 'img' && typeof node.properties.src === 'string') {
        if (!isSafeUrl(node.properties.src)) {
          node.properties.src = '';
        }
      }
    });
  };
}
