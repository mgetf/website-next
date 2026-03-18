/**
 * Site Content Service
 * CRUD operations for static site content (rulebook, homepage text, etc.)
 */

import { prisma } from '$lib/server/db';

// Content keys used throughout the site
export const CONTENT_KEYS = {
  RULEBOOK: 'rulebook',
  HOMEPAGE_SUBTITLE: 'homepage_subtitle',
  HOMEPAGE_ABOUT: 'homepage_about',
} as const;

export type ContentKey = (typeof CONTENT_KEYS)[keyof typeof CONTENT_KEYS];

/**
 * Get content by key
 */
export async function getContent(key: ContentKey): Promise<string | null> {
  const content = await prisma.siteContent.findUnique({
    where: { key },
  });
  return content?.content ?? null;
}

/**
 * Get content with metadata
 */
export async function getContentWithMeta(key: ContentKey) {
  return await prisma.siteContent.findUnique({
    where: { key },
  });
}

/**
 * Get all site content
 */
export async function getAllContent() {
  return await prisma.siteContent.findMany({
    orderBy: { key: 'asc' },
  });
}

/**
 * Update or create content
 */
export async function upsertContent(key: ContentKey, content: string, updatedBy?: string) {
  return await prisma.siteContent.upsert({
    where: { key },
    update: {
      content,
      updatedBy,
    },
    create: {
      key,
      content,
      updatedBy,
    },
  });
}

/**
 * Delete content by key
 */
export async function deleteContent(key: ContentKey) {
  return await prisma.siteContent.delete({
    where: { key },
  });
}

/**
 * Get default content for initial setup
 */
export function getDefaultContent(key: ContentKey): string {
  switch (key) {
    case CONTENT_KEYS.RULEBOOK:
      return `# MGE.tf Rulebook

## 1. General Rules

### 1.1 Eligibility
All players must have a valid Steam account and be in good standing with the league.

### 1.2 Conduct
Players are expected to maintain sportsmanlike conduct at all times.

## 2. Match Rules

### 2.1 Match Format
Matches are played in a best-of-3 format unless otherwise specified.

### 2.2 Scheduling
Teams are responsible for scheduling their matches within the designated week.

## 3. Disputes

### 3.1 Filing a Dispute
Disputes must be filed within 24 hours of match completion.

### 3.2 Resolution
Admins will review all evidence and make a final decision.

---

*Last updated: ${new Date().toLocaleDateString()}*`;

    case CONTENT_KEYS.HOMEPAGE_SUBTITLE:
      return 'The Premier MGE League';

    case CONTENT_KEYS.HOMEPAGE_ABOUT:
      return `## What is MGE?

MGE (My Gaming Edge) is a competitive 1v1 and 2v2 arena format for Team Fortress 2. Players face off in intense duels on custom-designed arenas, testing their mechanical skills and game sense.

### Why Join MGE.tf?

- **Competitive Seasons** - Regular seasons with divisions for all skill levels
- **Active Community** - Join our Discord and connect with fellow players
- **Improve Your Skills** - Nothing beats focused practice against skilled opponents
- **Prizes & Recognition** - Top performers earn recognition and prizes`;

    default:
      return '';
  }
}
