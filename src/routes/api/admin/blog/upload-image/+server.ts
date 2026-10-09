import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '#lib/server/auth/permissions.js';
import { uploadContentImage } from '#lib/server/services/blog.js';

export const POST: RequestHandler = async ({ request, locals }) => {
  requireAdmin(locals.user);

  const formData = await request.formData();
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    error(400, 'No file provided');
  }

  const url = await uploadContentImage(file);
  return Response.json({ url });
};
