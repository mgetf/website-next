import { describe, expect, it } from 'vitest';
import { rehypeSanitizeUrls } from './markdownSanitize';

describe('rehypeSanitizeUrls', () => {
  it('exports a unified plugin factory that returns a tree transformer', () => {
    const transformer = rehypeSanitizeUrls();
    expect(typeof transformer).toBe('function');

    const tree = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'a',
          properties: { href: 'javascript:alert(1)' },
          children: [],
        },
        {
          type: 'element',
          tagName: 'a',
          properties: { href: 'https://mge.tf' },
          children: [],
        },
        {
          type: 'element',
          tagName: 'img',
          properties: { src: 'data:text/html,x' },
          children: [],
        },
      ],
    };

    transformer(tree);

    expect(tree.children[0]!.properties.href).toBe('#');
    expect(tree.children[1]!.properties.href).toBe('https://mge.tf');
    expect(tree.children[2]!.properties.src).toBe('');
  });
});
