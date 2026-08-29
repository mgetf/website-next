import { z } from 'zod';
import { prisma } from '$lib/server/db';
import { badRequest, notFound } from '$lib/server/utils/errors';

export const togglePostLikeSchema = z.object({
  postId: z.coerce.number().int().positive('Invalid post ID'),
});

export const toggleCommentLikeSchema = z.object({
  commentId: z.coerce.number().int().positive('Invalid comment ID'),
});

/**
 * Batch like counts for a set of posts.
 * Returns a map of postId -> count; posts with no likes are omitted.
 */
export async function getLikeCountsForPosts(postIds: number[]): Promise<Map<number, number>> {
  if (postIds.length === 0) return new Map();

  const grouped = await prisma.blogPostLike.groupBy({
    by: ['postId'],
    where: { postId: { in: postIds } },
    _count: { _all: true },
  });

  return new Map(grouped.map((row) => [row.postId, row._count._all]));
}

export async function toggleBlogPostLike(
  postId: number,
  userId: string,
): Promise<{ liked: boolean; likeCount: number }> {
  const post = await prisma.blogPost.findUnique({
    where: { id: postId },
    select: { id: true, published: true },
  });
  if (!post || !post.published) notFound('Blog post not found');

  return prisma.$transaction(async (tx) => {
    const existing = await tx.blogPostLike.findUnique({
      where: { postId_userId: { postId, userId } },
    });

    if (existing) {
      await tx.blogPostLike.delete({
        where: { postId_userId: { postId, userId } },
      });
    } else {
      await tx.blogPostLike.create({
        data: { postId, userId },
      });
    }

    const likeCount = await tx.blogPostLike.count({ where: { postId } });
    return { liked: !existing, likeCount };
  });
}

export async function toggleBlogCommentLike(
  commentId: number,
  userId: string,
): Promise<{ liked: boolean; likeCount: number }> {
  const comment = await prisma.blogComment.findUnique({
    where: { id: commentId },
    select: {
      id: true,
      deletedAt: true,
      post: { select: { published: true } },
    },
  });
  if (!comment || !comment.post.published) notFound('Comment not found');
  if (comment.deletedAt) badRequest('Cannot like a deleted comment');

  return prisma.$transaction(async (tx) => {
    const existing = await tx.blogCommentLike.findUnique({
      where: { commentId_userId: { commentId, userId } },
    });

    if (existing) {
      await tx.blogCommentLike.delete({
        where: { commentId_userId: { commentId, userId } },
      });
    } else {
      await tx.blogCommentLike.create({
        data: { commentId, userId },
      });
    }

    const likeCount = await tx.blogCommentLike.count({ where: { commentId } });
    return { liked: !existing, likeCount };
  });
}
