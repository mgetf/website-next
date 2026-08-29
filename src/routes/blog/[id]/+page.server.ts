import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';
import { getBlogPostById, parseBlogPostId } from '$lib/server/services/blog';
import {
  blogCommentFormSchema,
  createBlogComment,
  deleteBlogComment,
  getCommentsForPost,
} from '$lib/server/services/blogComments';
import {
  toggleBlogPostLike,
  toggleBlogCommentLike,
  togglePostLikeSchema,
  toggleCommentLikeSchema,
} from '$lib/server/services/blogLikes';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';
import { isAdmin, requireAuth, requireNotBanned } from '$lib/server/auth/permissions';
import { buildPageSeo } from '$lib/utils/seo';
import { formError, formSuccess, validateForm, validationError } from '$lib/server/utils/forms';
import { getErrorMessage } from '$lib/server/utils/errors';
import {
  blogCommentRateLimiter,
  blogLikeRateLimiter,
  checkFormActionRateLimit,
} from '$lib/server/utils/rateLimit';

export const load: PageServerLoad = async ({ params, locals, url }) => {
  const id = parseBlogPostId(params.id);
  const canEdit = isAdmin(locals.user);
  const post = await getBlogPostById(id, {
    includeUnpublished: canEdit,
    viewerSteamId: locals.user?.steamId,
  });
  const viewer = locals.user
    ? { steamId: locals.user.steamId, isAdmin: isAdmin(locals.user) }
    : null;
  const comments = await getCommentsForPost(id, post.author?.steamId ?? null, viewer);

  return {
    seo: buildPageSeo(url.origin, {
      title: `${post.title} | MGE.tf Blog`,
      description: post.excerpt?.trim() || post.title,
      image: post.coverImage,
      imageAlt: post.title,
      card: post.coverImage ? 'summary_large_image' : 'summary',
      type: 'article',
    }),
    post,
    canEdit,
    comments,
  };
};

const deleteCommentSchema = z.object({
  commentId: z.coerce.number().int().positive(),
});

export const actions: Actions = {
  addComment: async ({ request, locals }) => {
    requireAuth(locals.user);
    requireNotBanned(locals.user);

    const rateLimited = checkFormActionRateLimit(blogCommentRateLimiter, locals.user.steamId);
    if (rateLimited) return rateLimited;

    const formData = await request.formData();
    const validation = validateForm(formData, blogCommentFormSchema);
    if (!validation.success) return validationError(validation.errors);

    try {
      await createBlogComment({
        postId: validation.data.postId,
        authorId: locals.user.steamId,
        content: validation.data.content,
        parentId: validation.data.parentId,
      });
      return formSuccess();
    } catch (err) {
      return formError(getErrorMessage(err, 'Failed to post comment'), 500);
    }
  },

  deleteComment: async ({ request, locals, getClientAddress }) => {
    requireAuth(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, deleteCommentSchema);
    if (!validation.success) return validationError(validation.errors);

    try {
      const { wasOwnComment } = await deleteBlogComment(validation.data.commentId, {
        steamId: locals.user.steamId,
        isAdmin: isAdmin(locals.user),
      });

      if (!wasOwnComment) {
        await logAudit({
          actorId: locals.user.steamId,
          actorRole: locals.user.permissionLevel,
          category: AuditCategory.BLOG,
          action: AuditAction.BLOG_COMMENT_DELETED,
          targetType: 'BlogComment',
          targetId: String(validation.data.commentId),
          ipAddress: getClientAddress(),
        });
      }

      return formSuccess();
    } catch (err) {
      return formError(getErrorMessage(err, 'Failed to delete comment'), 500);
    }
  },

  togglePostLike: async ({ request, locals }) => {
    requireAuth(locals.user);
    requireNotBanned(locals.user);

    const rateLimited = checkFormActionRateLimit(blogLikeRateLimiter, locals.user.steamId);
    if (rateLimited) return rateLimited;

    const formData = await request.formData();
    const validation = validateForm(formData, togglePostLikeSchema);
    if (!validation.success) return validationError(validation.errors);

    try {
      const result = await toggleBlogPostLike(validation.data.postId, locals.user.steamId);
      return formSuccess(result);
    } catch (err) {
      return formError(getErrorMessage(err, 'Failed to update like'), 500);
    }
  },

  toggleCommentLike: async ({ request, locals }) => {
    requireAuth(locals.user);
    requireNotBanned(locals.user);

    const rateLimited = checkFormActionRateLimit(blogLikeRateLimiter, locals.user.steamId);
    if (rateLimited) return rateLimited;

    const formData = await request.formData();
    const validation = validateForm(formData, toggleCommentLikeSchema);
    if (!validation.success) return validationError(validation.errors);

    try {
      const result = await toggleBlogCommentLike(validation.data.commentId, locals.user.steamId);
      return formSuccess(result);
    } catch (err) {
      return formError(getErrorMessage(err, 'Failed to update like'), 500);
    }
  },
};
