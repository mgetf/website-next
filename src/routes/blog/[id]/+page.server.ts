import type { PageServerLoad } from './$types';
import { getBlogPostById, parseBlogPostId } from '$lib/server/services/blog';
import { isAdmin } from '$lib/server/auth/permissions';
import { buildPageSeo } from '$lib/utils/seo';

export const load: PageServerLoad = async ({ params, locals, url }) => {
  const id = parseBlogPostId(params.id);
  const canEdit = isAdmin(locals.user);
  const post = await getBlogPostById(id, { includeUnpublished: canEdit });

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
  };
};
