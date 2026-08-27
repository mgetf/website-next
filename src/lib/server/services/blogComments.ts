import { z } from 'zod';
import { prisma } from '$lib/server/db';
import { badRequest, forbidden, notFound } from '$lib/server/utils/errors';
import type { BlogCommentNode } from '$lib/types/blogComment';

export const blogCommentFormSchema = z.object({
  postId: z.coerce.number().int().positive('Invalid post ID'),
  content: z
    .string()
    .trim()
    .min(1, 'Comment cannot be empty')
    .max(2000, 'Comment must be less than 2000 characters'),
  parentId: z.coerce.number().int().positive().optional(),
});

const AUTHOR_SELECT = {
  steamId: true,
  steamUsername: true,
  steamAvatar: true,
} as const;

type AuthorRow = {
  steamId: string;
  steamUsername: string;
  steamAvatar: string | null;
};

type CommentRow = {
  id: number;
  parentId: number | null;
  authorId: string;
  content: string;
  deletedAt: Date | null;
  createdAt: Date;
  author: AuthorRow;
};

type Viewer = { steamId: string; isAdmin: boolean } | null;

function toNode(
  comment: CommentRow,
  byParent: Map<number | null, CommentRow[]>,
  postAuthorId: string | null,
  viewer: Viewer,
): BlogCommentNode {
  const isDeleted = comment.deletedAt !== null;
  const children = (byParent.get(comment.id) ?? []).slice().sort((a, b) => {
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  return {
    id: comment.id,
    content: isDeleted ? '[deleted]' : comment.content,
    createdAt: comment.createdAt.toISOString(),
    deleted: isDeleted,
    author: isDeleted
      ? null
      : {
          steamId: comment.author.steamId,
          name: comment.author.steamUsername,
          avatar: comment.author.steamAvatar,
        },
    isOP: !isDeleted && postAuthorId !== null && comment.authorId === postAuthorId,
    canDelete:
      !isDeleted && viewer !== null && (viewer.steamId === comment.authorId || viewer.isAdmin),
    replies: children.map((child) => toNode(child, byParent, postAuthorId, viewer)),
  };
}

/**
 * Fetch the full comment thread for a post as a nested tree.
 * Top-level comments are newest-first; replies within a thread are oldest-first.
 */
export async function getCommentsForPost(
  postId: number,
  postAuthorId: string | null,
  viewer: Viewer,
): Promise<BlogCommentNode[]> {
  const comments = await prisma.blogComment.findMany({
    where: { postId },
    include: { author: { select: AUTHOR_SELECT } },
    orderBy: { createdAt: 'asc' },
  });

  const byParent = new Map<number | null, CommentRow[]>();
  for (const comment of comments) {
    const key = comment.parentId;
    const list = byParent.get(key);
    if (list) list.push(comment);
    else byParent.set(key, [comment]);
  }

  const topLevel = (byParent.get(null) ?? [])
    .slice()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return topLevel.map((comment) => toNode(comment, byParent, postAuthorId, viewer));
}

/**
 * Batch comment counts (excluding soft-deleted comments) for a set of posts.
 * Returns a map of postId -> count; posts with no comments are omitted.
 */
export async function getCommentCountsForPosts(postIds: number[]): Promise<Map<number, number>> {
  if (postIds.length === 0) return new Map();

  const grouped = await prisma.blogComment.groupBy({
    by: ['postId'],
    where: { postId: { in: postIds }, deletedAt: null },
    _count: { _all: true },
  });

  return new Map(grouped.map((row) => [row.postId, row._count._all]));
}

export async function createBlogComment(input: {
  postId: number;
  authorId: string;
  content: string;
  parentId?: number;
}): Promise<void> {
  const post = await prisma.blogPost.findUnique({
    where: { id: input.postId },
    select: { id: true, published: true },
  });
  if (!post || !post.published) notFound('Blog post not found');

  if (input.parentId !== undefined) {
    const parent = await prisma.blogComment.findUnique({
      where: { id: input.parentId },
      select: { postId: true, deletedAt: true },
    });
    if (!parent || parent.postId !== input.postId) badRequest('Invalid parent comment');
    if (parent.deletedAt) badRequest('Cannot reply to a deleted comment');
  }

  await prisma.blogComment.create({
    data: {
      postId: input.postId,
      authorId: input.authorId,
      parentId: input.parentId ?? null,
      content: input.content,
    },
  });
}

export async function deleteBlogComment(
  commentId: number,
  requester: { steamId: string; isAdmin: boolean },
): Promise<{ wasOwnComment: boolean }> {
  const comment = await prisma.blogComment.findUnique({ where: { id: commentId } });
  if (!comment) notFound('Comment not found');

  const wasOwnComment = comment.authorId === requester.steamId;
  if (!wasOwnComment && !requester.isAdmin) {
    forbidden('You cannot delete this comment');
  }

  if (!comment.deletedAt) {
    await prisma.blogComment.update({
      where: { id: commentId },
      data: { deletedAt: new Date() },
    });
  }

  return { wasOwnComment };
}
