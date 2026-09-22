#!/usr/bin/env bun
/**
 * List (and optionally delete) leftover map objects in the R2 bucket.
 *
 * Catalog downloads no longer store .bsp / .cfg files. Objects under the
 * maps/ prefix are unused.
 *
 * Dry-run (default):
 *   bun run scripts/purge-r2-maps.ts
 *   bun --env-file=.env.production run scripts/purge-r2-maps.ts
 *
 * Delete:
 *   bun run scripts/purge-r2-maps.ts --delete
 *   bun --env-file=.env.production run scripts/purge-r2-maps.ts --delete
 */

import { config } from 'dotenv';
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  type _Object,
} from '@aws-sdk/client-s3';

config();

const PREFIX = 'maps/';
const deleteMode = process.argv.includes('--delete');

const endpoint = process.env.S3_EU_ENDPOINT || process.env.S3_ENDPOINT;
const accessKeyId = process.env.S3_ACCESS_KEY_ID;
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
const bucket = process.env.CLOUDFLARE_BUCKET_NAME;

if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
  throw new Error(
    'R2 is not configured. Need S3_EU_ENDPOINT or S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, and CLOUDFLARE_BUCKET_NAME.',
  );
}

const client = new S3Client({
  region: 'auto',
  endpoint,
  credentials: { accessKeyId, secretAccessKey },
});

async function listMapObjects(): Promise<_Object[]> {
  const objects: _Object[] = [];
  let continuationToken: string | undefined;

  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: PREFIX,
        ContinuationToken: continuationToken,
      }),
    );
    if (page.Contents) objects.push(...page.Contents);
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);

  return objects.filter((obj) => obj.Key && obj.Key.startsWith(PREFIX));
}

async function deleteKeys(keys: string[]): Promise<void> {
  const chunkSize = 1000;
  for (let i = 0; i < keys.length; i += chunkSize) {
    const chunk = keys.slice(i, i + chunkSize);
    const result = await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Objects: chunk.map((Key) => ({ Key })),
          Quiet: true,
        },
      }),
    );
    if (result.Errors && result.Errors.length > 0) {
      for (const err of result.Errors) {
        console.error(`Failed to delete ${err.Key}: ${err.Message}`);
      }
      throw new Error(`Failed to delete ${result.Errors.length} object(s)`);
    }
  }
}

const objects = await listMapObjects();

if (objects.length === 0) {
  console.log(`No objects found under ${PREFIX} in ${bucket}.`);
  process.exit(0);
}

console.log(`Found ${objects.length} object(s) under ${PREFIX} in ${bucket}:`);
for (const obj of objects) {
  const size = obj.Size ?? 0;
  console.log(`  ${obj.Key}  (${size} bytes)`);
}

if (!deleteMode) {
  console.log('\nDry-run only. Re-run with --delete to remove these objects.');
  process.exit(0);
}

const keys = objects.map((obj) => obj.Key).filter((key): key is string => Boolean(key));
await deleteKeys(keys);
console.log(`Deleted ${keys.length} object(s) under ${PREFIX}.`);
