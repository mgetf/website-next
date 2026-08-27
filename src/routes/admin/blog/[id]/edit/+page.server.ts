import type { Actions, PageServerLoad } from './$types';
import { isRedirect, redirect } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth/permissions';
import {
  blogPostFormSchema,
  coverImageFromFormData,
  deleteCoverImage,
  getBlogPostById,
  parseBlogPostId,
  publishBlogPost,
  updateBlogPost,
} from '$lib/server/services/blog';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';
import { validateForm, validationError, formError } from '$lib/server/utils/forms';
import { getErrorMessage } from '$lib/server/utils/errors';

export const load: PageServerLoad = async ({ locals, params }) => {
  requireAdmin(locals.user);

  const id = parseBlogPostId(params.id);
  const post = await getBlogPostById(id, { includeUnpublished: true });

  return { post };
};

async function savePost(
  request: Request,
  locals: App.Locals,
  params: { id: string },
  getClientAddress: () => string,
  publish: boolean,
) {
  requireAdmin(locals.user);

  const id = parseBlogPostId(params.id);
  const formData = await request.formData();
  const validation = validateForm(formData, blogPostFormSchema);
  if (!validation.success) return validationError(validation.errors);

  const title = validation.data.title;
  const excerpt = validation.data.excerpt.trim() || null;
  const content = validation.data.content;
  const coverImageCaption = validation.data.coverImageCaption.trim() || null;

  try {
    const existing = await getBlogPostById(id, { includeUnpublished: true });
    const newCover = await coverImageFromFormData(formData);

    const post = await updateBlogPost(id, {
      title,
      excerpt,
      content,
      coverImageCaption,
      ...(newCover ? { coverImage: newCover } : {}),
    });

    if (newCover && existing.coverImage && existing.coverImage !== newCover) {
      await deleteCoverImage(existing.coverImage);
    }

    if (publish && !post.published) {
      await publishBlogPost(id);
    }

    await logAudit({
      actorId: locals.user.steamId,
      actorRole: locals.user.permissionLevel,
      category: AuditCategory.BLOG,
      action:
        publish && !existing.published
          ? AuditAction.BLOG_POST_PUBLISHED
          : AuditAction.BLOG_POST_UPDATED,
      targetType: 'BlogPost',
      targetId: String(id),
      metadata: { title, published: publish || existing.published },
      ipAddress: getClientAddress(),
    });

    throw redirect(303, '/admin/blog');
  } catch (err) {
    if (isRedirect(err)) throw err;
    return formError(getErrorMessage(err, 'Failed to save post'), 500);
  }
}

export const actions: Actions = {
  saveDraft: async ({ request, locals, params, getClientAddress }) => {
    return savePost(request, locals, params, getClientAddress, false);
  },

  publish: async ({ request, locals, params, getClientAddress }) => {
    return savePost(request, locals, params, getClientAddress, true);
  },
};
