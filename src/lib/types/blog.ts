export interface BlogPostAuthor {
  steamId: string;
  name: string;
  avatar: string | null;
}

export interface BlogPostSummary {
  id: number;
  title: string;
  excerpt: string | null;
  coverImage: string | null;
  coverImageCaption: string | null;
  published: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  author: BlogPostAuthor | null;
}

export interface BlogPostDetail extends BlogPostSummary {
  content: string;
}

export interface BlogPostPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
