/**
 * Site Content Service
 * CRUD operations for static site content (rulebook, homepage text, etc.)
 */

import { prisma } from '$lib/server/db';
import { badRequest, conflict, notFound } from '$lib/server/utils/errors';
import type {
  PublishedRulebook,
  RulebookRevisionDetail,
  RulebookRevisionSummary,
} from '$lib/types/rulebook';
import { nextRulebookVersion, validateRulebookPublish } from '$lib/utils/rulebookPublish';
import { diffText } from '$lib/utils/textDiff';

// Content keys used throughout the site
export const CONTENT_KEYS = {
  RULEBOOK: 'rulebook',
  HOMEPAGE_SUBTITLE: 'homepage_subtitle',
  HOMEPAGE_ABOUT: 'homepage_about',
  MATCH_CREATED_MESSAGE: 'match_created_message',
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
`;

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

    case CONTENT_KEYS.MATCH_CREATED_MESSAGE:
      return `**Match Created!** Important Information:

1. **Contact:** Please reach out to your opponent via Discord or Steam.
2. **Demo Required:** You must record a demo of your match.
3. **Servers:** Check \`#match-servers\` in Discord for official server information.
4. **Rules:** Review the [rulebook](https://mge.tf/rulebook).
5. **Issue Resolution:**
   - First, check the rulebook
   - Then, communicate with your opponent
   - Only contact an admin as a last resort

Need help? Ask in Discord or contact an admin.

Good luck to both teams!`;

    default:
      return '';
  }
}

const revisionPublisherInclude = {
  publisher: {
    select: {
      steamId: true,
      steamUsername: true,
    },
  },
} as const;

function toRevisionSummary(revision: {
  version: number;
  message: string;
  publishedAt: Date;
  publishedBy: string | null;
  publisher: { steamId: string; steamUsername: string } | null;
}): RulebookRevisionSummary {
  return {
    version: revision.version,
    message: revision.message,
    publishedAt: revision.publishedAt.toISOString(),
    publishedBySteamId: revision.publisher?.steamId ?? revision.publishedBy,
    publishedByName: revision.publisher?.steamUsername ?? null,
  };
}

export async function getPublishedRulebook(): Promise<PublishedRulebook> {
  const [live, latest] = await Promise.all([
    prisma.siteContent.findUnique({
      where: { key: CONTENT_KEYS.RULEBOOK },
    }),
    prisma.rulebookRevision.findFirst({
      orderBy: { version: 'desc' },
      include: revisionPublisherInclude,
    }),
  ]);

  return {
    content: live?.content ?? getDefaultContent(CONTENT_KEYS.RULEBOOK),
    version: latest?.version ?? null,
    updatedAt: latest?.publishedAt.toISOString() ?? live?.updatedAt.toISOString() ?? null,
    updatedByName: latest?.publisher?.steamUsername ?? null,
  };
}

export async function listRulebookRevisions(): Promise<RulebookRevisionSummary[]> {
  const revisions = await prisma.rulebookRevision.findMany({
    orderBy: { version: 'desc' },
    include: revisionPublisherInclude,
  });

  return revisions.map(toRevisionSummary);
}

export async function getRulebookRevision(version: number): Promise<RulebookRevisionDetail> {
  if (!Number.isInteger(version) || version < 1) {
    notFound('Rulebook revision not found');
  }

  const [current, previous, next] = await Promise.all([
    prisma.rulebookRevision.findUnique({
      where: { version },
      include: revisionPublisherInclude,
    }),
    prisma.rulebookRevision.findUnique({
      where: { version: version - 1 },
      select: { version: true, content: true },
    }),
    prisma.rulebookRevision.findUnique({
      where: { version: version + 1 },
      select: { version: true },
    }),
  ]);

  if (!current) {
    notFound('Rulebook revision not found');
  }

  const previousContent = previous?.content ?? '';

  return {
    ...toRevisionSummary(current),
    content: current.content,
    previousVersion: previous?.version ?? null,
    nextVersion: next?.version ?? null,
    hunks: diffText(previousContent, current.content),
  };
}

export async function publishRulebook(input: {
  content: string;
  message: string;
  publishedBy: string;
  expectedVersion: number;
}): Promise<{ version: number }> {
  return prisma.$transaction(async (tx) => {
    const [live, latest] = await Promise.all([
      tx.siteContent.findUnique({
        where: { key: CONTENT_KEYS.RULEBOOK },
        select: { content: true },
      }),
      tx.rulebookRevision.findFirst({
        orderBy: { version: 'desc' },
        select: { version: true },
      }),
    ]);

    const currentVersion = latest?.version ?? 0;
    const currentContent = live?.content ?? '';
    const validation = validateRulebookPublish({
      content: input.content,
      message: input.message,
      currentContent,
      currentVersion,
      expectedVersion: input.expectedVersion,
    });

    if (!validation.ok) {
      if (validation.conflict) {
        conflict(validation.error);
      }
      badRequest(validation.error);
    }

    const version = nextRulebookVersion(currentVersion);

    await tx.rulebookRevision.create({
      data: {
        version,
        content: input.content,
        message: input.message.trim(),
        publishedBy: input.publishedBy,
      },
    });

    await tx.siteContent.upsert({
      where: { key: CONTENT_KEYS.RULEBOOK },
      update: {
        content: input.content,
        updatedBy: input.publishedBy,
      },
      create: {
        key: CONTENT_KEYS.RULEBOOK,
        content: input.content,
        updatedBy: input.publishedBy,
      },
    });

    return { version };
  });
}
