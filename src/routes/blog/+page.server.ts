import type { PageServerLoad } from './$types';
import { getPublishedBlogPosts } from '$lib/server/services/blog';
import { buildPageSeo } from '$lib/utils/seo';

export const load: PageServerLoad = async ({ url }) => {
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const { posts, pagination } = await getPublishedBlogPosts({ page });

  return {
    seo: buildPageSeo(url.origin, {
      title: 'Blog | MGE.tf',
      description: 'News, updates, and behind-the-scenes from the MGE.tf team',
    }),
    posts,
    pagination,
  };
};
