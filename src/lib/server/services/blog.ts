import { z } from 'zod';
import { prisma } from '$lib/server/db';
import { badRequest, notFound } from '$lib/server/utils/errors';
import { getCommentCountsForPosts } from '$lib/server/services/blogComments';
import { getLikeCountsForPosts } from '$lib/server/services/blogLikes';
import {
  deleteFromR2,
  deleteTempFile,
  extensionForImageMime,
  isR2Available,
  saveTempFile,
  uploadToR2,
  validateUploadedFile,
} from '$lib/server/utils/r2Upload';
import type {
  BlogPostAuthor,
  BlogPostDetail,
  BlogPostPagination,
  BlogPostSummary,
} from '$lib/types/blog';

export const blogPostFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Title is required')
    .max(200, 'Title must be less than 200 characters'),
  excerpt: z.string().max(500, 'Excerpt must be less than 500 characters').optional().default(''),
  content: z.string().min(1, 'Content is required'),
  coverImageCaption: z
    .string()
    .max(200, 'Caption must be less than 200 characters')
    .optional()
    .default(''),
});

export const blogPostIdSchema = z.object({
  id: z.coerce.number().int().positive('Invalid post ID'),
});

const AUTHOR_SELECT = {
  steamId: true,
  steamUsername: true,
  steamAvatar: true,
} as const;

const DEFAULT_PAGE_SIZE = 12;

type AuthorRow = {
  steamId: string;
  steamUsername: string;
  steamAvatar: string | null;
};

type BlogPostRow = {
  id: number;
  title: string;
  excerpt: string | null;
  content: string;
  coverImage: string | null;
  coverImageCaption: string | null;
  published: boolean;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  author: AuthorRow | null;
};

type CreateBlogPostInput = {
  title: string;
  excerpt: string | null;
  content: string;
  coverImage: string | null;
  coverImageCaption: string | null;
  authorId: string;
  published?: boolean;
};

type UpdateBlogPostInput = {
  title: string;
  excerpt: string | null;
  content: string;
  coverImage?: string | null;
  coverImageCaption: string | null;
};

function toAuthor(author: AuthorRow | null): BlogPostAuthor | null {
  if (!author) return null;
  return {
    steamId: author.steamId,
    name: author.steamUsername,
    avatar: author.steamAvatar,
  };
}

function toSummary(
  post: BlogPostRow,
  commentCount = 0,
  likeCount = 0,
  likedByMe = false,
): BlogPostSummary {
  return {
    id: post.id,
    title: post.title,
    excerpt: post.excerpt,
    coverImage: post.coverImage,
    coverImageCaption: post.coverImageCaption,
    published: post.published,
    publishedAt: post.publishedAt?.toISOString() ?? null,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
    author: toAuthor(post.author),
    commentCount,
    likeCount,
    likedByMe,
  };
}

function toDetail(
  post: BlogPostRow,
  commentCount = 0,
  likeCount = 0,
  likedByMe = false,
): BlogPostDetail {
  return {
    ...toSummary(post, commentCount, likeCount, likedByMe),
    content: post.content,
  };
}

export async function getPublishedBlogPosts({
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
}: {
  page?: number;
  pageSize?: number;
} = {}): Promise<{ posts: BlogPostSummary[]; pagination: BlogPostPagination }> {
  const where = { published: true };
  const total = await prisma.blogPost.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  const posts = await prisma.blogPost.findMany({
    where,
    orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
    skip: (safePage - 1) * pageSize,
    take: pageSize,
    include: { author: { select: AUTHOR_SELECT } },
  });

  const postIds = posts.map((post) => post.id);
  const [commentCounts, likeCounts] = await Promise.all([
    getCommentCountsForPosts(postIds),
    getLikeCountsForPosts(postIds),
  ]);

  return {
    posts: posts.map((post) =>
      toSummary(post, commentCounts.get(post.id) ?? 0, likeCounts.get(post.id) ?? 0),
    ),
    pagination: {
      page: safePage,
      pageSize,
      total,
      totalPages: total === 0 ? 0 : totalPages,
    },
  };
}

export async function getBlogPostById(
  id: number,
  {
    includeUnpublished = false,
    viewerSteamId,
  }: { includeUnpublished?: boolean; viewerSteamId?: string } = {},
): Promise<BlogPostDetail> {
  const post = await prisma.blogPost.findUnique({
    where: { id },
    include: {
      author: { select: AUTHOR_SELECT },
      _count: { select: { likes: true } },
      likes: viewerSteamId
        ? { where: { userId: viewerSteamId }, select: { userId: true }, take: 1 }
        : false,
    },
  });

  if (!post || (!post.published && !includeUnpublished)) {
    notFound('Blog post not found');
  }

  const commentCount = (await getCommentCountsForPosts([post.id])).get(post.id) ?? 0;
  const likedByMe = Boolean(viewerSteamId && Array.isArray(post.likes) && post.likes.length > 0);

  return toDetail(post, commentCount, post._count.likes, likedByMe);
}

export async function getAllBlogPostsForAdmin(): Promise<BlogPostSummary[]> {
  const posts = await prisma.blogPost.findMany({
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    include: { author: { select: AUTHOR_SELECT } },
  });

  const postIds = posts.map((post) => post.id);
  const [commentCounts, likeCounts] = await Promise.all([
    getCommentCountsForPosts(postIds),
    getLikeCountsForPosts(postIds),
  ]);

  return posts.map((post) =>
    toSummary(post, commentCounts.get(post.id) ?? 0, likeCounts.get(post.id) ?? 0),
  );
}

export async function createBlogPost(data: CreateBlogPostInput): Promise<BlogPostDetail> {
  const now = new Date();
  const post = await prisma.blogPost.create({
    data: {
      title: data.title,
      excerpt: data.excerpt,
      content: data.content,
      coverImage: data.coverImage,
      coverImageCaption: data.coverImageCaption,
      authorId: data.authorId,
      published: data.published ?? false,
      publishedAt: data.published ? now : null,
    },
    include: { author: { select: AUTHOR_SELECT } },
  });

  return toDetail(post);
}

export async function updateBlogPost(
  id: number,
  data: UpdateBlogPostInput,
): Promise<BlogPostDetail> {
  const existing = await prisma.blogPost.findUnique({ where: { id } });
  if (!existing) notFound('Blog post not found');

  const post = await prisma.blogPost.update({
    where: { id },
    data: {
      title: data.title,
      excerpt: data.excerpt,
      content: data.content,
      coverImageCaption: data.coverImageCaption,
      ...(data.coverImage !== undefined ? { coverImage: data.coverImage } : {}),
    },
    include: { author: { select: AUTHOR_SELECT } },
  });

  return toDetail(post);
}

export async function publishBlogPost(id: number): Promise<BlogPostDetail> {
  const existing = await prisma.blogPost.findUnique({
    where: { id },
    include: { author: { select: AUTHOR_SELECT } },
  });
  if (!existing) notFound('Blog post not found');

  const post = await prisma.blogPost.update({
    where: { id },
    data: {
      published: true,
      publishedAt: existing.publishedAt ?? new Date(),
    },
    include: { author: { select: AUTHOR_SELECT } },
  });

  return toDetail(post);
}

export async function unpublishBlogPost(id: number): Promise<BlogPostDetail> {
  const existing = await prisma.blogPost.findUnique({ where: { id } });
  if (!existing) notFound('Blog post not found');

  const post = await prisma.blogPost.update({
    where: { id },
    data: { published: false },
    include: { author: { select: AUTHOR_SELECT } },
  });

  return toDetail(post);
}

export async function deleteBlogPost(id: number): Promise<void> {
  const existing = await prisma.blogPost.findUnique({ where: { id } });
  if (!existing) notFound('Blog post not found');

  await deleteCoverImage(existing.coverImage);
  await prisma.blogPost.delete({ where: { id } });
}

export async function uploadCoverImage(file: File): Promise<string> {
  if (!isR2Available()) {
    badRequest('File storage is not configured');
  }

  validateUploadedFile(file, 'image');

  const tempPath = await saveTempFile(file);
  try {
    const ext = extensionForImageMime(file.type).replace(/^\./, '');
    const remotePath = `blog/covers/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const publicUrl = await uploadToR2(tempPath, remotePath);
    if (!publicUrl) {
      badRequest('Failed to upload cover image');
    }
    return publicUrl;
  } finally {
    deleteTempFile(tempPath);
  }
}

export async function uploadContentImage(file: File): Promise<string> {
  if (!isR2Available()) {
    badRequest('File storage is not configured');
  }

  validateUploadedFile(file, 'image');

  const tempPath = await saveTempFile(file);
  try {
    const ext = extensionForImageMime(file.type).replace(/^\./, '');
    const remotePath = `blog/content/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const publicUrl = await uploadToR2(tempPath, remotePath);
    if (!publicUrl) {
      badRequest('Failed to upload image');
    }
    return publicUrl;
  } finally {
    deleteTempFile(tempPath);
  }
}

export async function deleteCoverImage(url: string | null): Promise<void> {
  if (!url) return;
  try {
    const key = new URL(url).pathname.replace(/^\//, '');
    if (key) await deleteFromR2(key);
  } catch {
    // Ignore invalid stored URLs
  }
}

export async function coverImageFromFormData(formData: FormData): Promise<string | undefined> {
  const file = formData.get('coverImage');
  if (file instanceof File && file.size > 0) {
    return await uploadCoverImage(file);
  }
  return undefined;
}

export function parseBlogPostId(raw: string | undefined): number {
  const id = Number.parseInt(raw ?? '', 10);
  if (!Number.isInteger(id) || id < 1) {
    notFound('Blog post not found');
  }
  return id;
}
