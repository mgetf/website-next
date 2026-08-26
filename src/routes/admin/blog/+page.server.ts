import type { Actions, PageServerLoad } from './$types';
import { requireAdmin, requireStrictAdmin, isStrictAdmin } from '$lib/server/auth/permissions';
import {
  blogPostIdSchema,
  deleteBlogPost,
  getAllBlogPostsForAdmin,
  publishBlogPost,
  unpublishBlogPost,
} from '$lib/server/services/blog';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';
import { validateForm, validationError, formError, formSuccess } from '$lib/server/utils/forms';
import { getErrorMessage } from '$lib/server/utils/errors';

export const load: PageServerLoad = async ({ locals }) => {
  requireAdmin(locals.user);

  const posts = await getAllBlogPostsForAdmin();

  return {
    isStrictAdmin: isStrictAdmin(locals.user),
    posts,
  };
};

export const actions: Actions = {
  publish: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, blogPostIdSchema);
    if (!validation.success) return validationError(validation.errors);

    const { id } = validation.data;

    try {
      await publishBlogPost(id);
      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.BLOG,
        action: AuditAction.BLOG_POST_PUBLISHED,
        targetType: 'BlogPost',
        targetId: String(id),
        ipAddress: getClientAddress(),
      });
      return formSuccess(undefined, 'Post published');
    } catch (err) {
      return formError(getErrorMessage(err, 'Failed to publish post'), 500);
    }
  },

  unpublish: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, blogPostIdSchema);
    if (!validation.success) return validationError(validation.errors);

    const { id } = validation.data;

    try {
      await unpublishBlogPost(id);
      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.BLOG,
        action: AuditAction.BLOG_POST_UNPUBLISHED,
        targetType: 'BlogPost',
        targetId: String(id),
        ipAddress: getClientAddress(),
      });
      return formSuccess(undefined, 'Post unpublished');
    } catch (err) {
      return formError(getErrorMessage(err, 'Failed to unpublish post'), 500);
    }
  },

  delete: async ({ request, locals, getClientAddress }) => {
    requireStrictAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, blogPostIdSchema);
    if (!validation.success) return validationError(validation.errors);

    const { id } = validation.data;

    try {
      await deleteBlogPost(id);
      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.BLOG,
        action: AuditAction.BLOG_POST_DELETED,
        targetType: 'BlogPost',
        targetId: String(id),
        ipAddress: getClientAddress(),
      });
      return formSuccess(undefined, 'Post deleted');
    } catch (err) {
      return formError(getErrorMessage(err, 'Failed to delete post'), 500);
    }
  },
};
