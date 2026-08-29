-- CreateTable
CREATE TABLE "blog_post_likes" (
    "post_id" INTEGER NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blog_post_likes_pkey" PRIMARY KEY ("post_id","user_id")
);

-- CreateTable
CREATE TABLE "blog_comment_likes" (
    "comment_id" INTEGER NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blog_comment_likes_pkey" PRIMARY KEY ("comment_id","user_id")
);

-- AddForeignKey
ALTER TABLE "blog_post_likes" ADD CONSTRAINT "blog_post_likes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "blog_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blog_post_likes" ADD CONSTRAINT "blog_post_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("steam_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blog_comment_likes" ADD CONSTRAINT "blog_comment_likes_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "blog_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blog_comment_likes" ADD CONSTRAINT "blog_comment_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("steam_id") ON DELETE CASCADE ON UPDATE CASCADE;
