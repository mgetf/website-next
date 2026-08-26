import type { Actions, PageServerLoad } from './$types';
import { isRedirect, redirect } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth/permissions';
import {
  blogPostFormSchema,
  coverImageFromFormData,
  createBlogPost,
} from '$lib/server/services/blog';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';
import { validateForm, validationError, formError } from '$lib/server/utils/forms';
import { getErrorMessage } from '$lib/server/utils/errors';

export const load: PageServerLoad = async ({ locals }) => {
  requireAdmin(locals.user);
  return {};
};

async function savePost(
  request: Request,
  locals: App.Locals,
  getClientAddress: () => string,
  publish: boolean,
) {
  requireAdmin(locals.user);

  const formData = await request.formData();
  const validation = validateForm(formData, blogPostFormSchema);
  if (!validation.success) return validationError(validation.errors);

  const title = validation.data.title;
  const excerpt = validation.data.excerpt.trim() || null;
  const content = validation.data.content;

  try {
    const coverImage = (await coverImageFromFormData(formData)) ?? null;
    const post = await createBlogPost({
      title,
      excerpt,
      content,
      coverImage,
      authorId: locals.user.steamId,
      published: publish,
    });

    await logAudit({
      actorId: locals.user.steamId,
      actorRole: locals.user.permissionLevel,
      category: AuditCategory.BLOG,
      action: publish ? AuditAction.BLOG_POST_PUBLISHED : AuditAction.BLOG_POST_CREATED,
      targetType: 'BlogPost',
      targetId: String(post.id),
      metadata: { title, published: publish },
      ipAddress: getClientAddress(),
    });

    throw redirect(303, '/admin/blog');
  } catch (err) {
    if (isRedirect(err)) throw err;
    return formError(getErrorMessage(err, 'Failed to save post'), 500);
  }
}

export const actions: Actions = {
  saveDraft: async ({ request, locals, getClientAddress }) => {
    return savePost(request, locals, getClientAddress, false);
  },

  publish: async ({ request, locals, getClientAddress }) => {
    return savePost(request, locals, getClientAddress, true);
  },
};
