export interface BlogCommentAuthor {
  steamId: string;
  name: string;
  avatar: string | null;
}

export interface BlogCommentNode {
  id: number;
  content: string;
  createdAt: string;
  deleted: boolean;
  author: BlogCommentAuthor | null;
  /** True when the comment's author is the blog post's author. */
  isOP: boolean;
  /** True when the current viewer may delete this comment (own comment or admin). */
  canDelete: boolean;
  replies: BlogCommentNode[];
}
