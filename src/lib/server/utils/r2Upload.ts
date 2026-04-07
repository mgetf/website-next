/**
 * Cloudflare R2 Upload Utilities
 * Handles file uploads to R2 storage
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { error } from '@sveltejs/kit';
import fs from 'fs';
import path from 'path';
import { getOptionalEnv } from '$lib/server/utils/env';

const R2_ENDPOINT = getOptionalEnv('S3_EU_ENDPOINT') || getOptionalEnv('S3_ENDPOINT');
const R2_ACCESS_KEY_ID = getOptionalEnv('S3_ACCESS_KEY_ID');
const R2_SECRET_ACCESS_KEY = getOptionalEnv('S3_SECRET_ACCESS_KEY');
const R2_BUCKET_NAME = getOptionalEnv('CLOUDFLARE_BUCKET_NAME');
const R2_PUBLIC_URL = getOptionalEnv('CLOUDFLARE_PUBLIC_URL');

// Check if R2 is configured
const isR2Configured = !!(
  R2_ENDPOINT &&
  R2_ACCESS_KEY_ID &&
  R2_SECRET_ACCESS_KEY &&
  R2_BUCKET_NAME &&
  R2_PUBLIC_URL
);

// Configure S3 client for R2 (only if configured)
let r2Client: S3Client | null = null;

if (isR2Configured) {
  r2Client = new S3Client({
    region: 'auto',
    endpoint: R2_ENDPOINT,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
} else {
  console.warn('⚠️  R2 storage not configured. Avatar uploads will be skipped.');
}

/**
 * Upload a file to R2 storage
 * @param localPath - Path to local file
 * @param remotePath - Path in R2 bucket (e.g., "team-avatars/1234567890.png")
 * @returns Public URL of uploaded file, or null if R2 not configured
 */
export async function uploadToR2(localPath: string, remotePath: string): Promise<string | null> {
  // Skip if R2 not configured
  if (!isR2Configured || !r2Client) {
    console.warn('R2 not configured, skipping upload');
    return null;
  }

  try {
    // Read file
    const fileContent = fs.readFileSync(localPath);

    // Determine content type from extension
    const ext = path.extname(localPath).toLowerCase();
    let contentType = 'application/octet-stream';

    if (ext === '.jpg' || ext === '.jpeg') {
      contentType = 'image/jpeg';
    } else if (ext === '.png') {
      contentType = 'image/png';
    } else if (ext === '.gif') {
      contentType = 'image/gif';
    } else if (ext === '.webp') {
      contentType = 'image/webp';
    }

    // Upload to R2
    // Note: The bucket is "images" but we need to include "images/" in the Key path
    // because the public URL expects: {public-url}/images/{path}
    const fullKey = `images/${remotePath}`;

    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: fullKey,
      Body: fileContent,
      ContentType: contentType,
    });

    await r2Client.send(command);

    // Return public URL
    const baseUrl = R2_PUBLIC_URL.endsWith('/') ? R2_PUBLIC_URL : `${R2_PUBLIC_URL}/`;
    const publicUrl = `${baseUrl}images/${remotePath}`;
    return publicUrl;
  } catch (err) {
    console.error('Error uploading to R2:', err);
    throw error(500, 'Failed to upload file');
  }
}

/**
 * Delete a file from R2 storage
 * @param remotePath - Path in R2 bucket
 */
export async function deleteFromR2(remotePath: string): Promise<void> {
  // Skip if R2 not configured
  if (!isR2Configured || !r2Client) {
    return;
  }

  try {
    const command = new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: remotePath,
    });

    await r2Client.send(command);
  } catch (err) {
    console.error('Error deleting from R2:', err);
    // Don't throw error - file might not exist
  }
}

/**
 * Check if R2 storage is configured
 */
export function isR2Available(): boolean {
  return isR2Configured;
}

/**
 * Upload a Buffer directly to R2 with an explicit key and content type.
 * Unlike uploadToR2, this does NOT prepend "images/" to the key.
 * @param buffer - Raw file content
 * @param key - Full R2 object key (e.g. "maps/mge_foo.bsp")
 * @param contentType - MIME type for the object
 * @returns Public URL of the uploaded file, or null if R2 not configured
 */
export async function uploadBufferToR2(
  buffer: Buffer,
  key: string,
  contentType: string,
): Promise<string | null> {
  if (!isR2Configured || !r2Client) {
    console.warn('R2 not configured, skipping upload');
    return null;
  }

  try {
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    });

    await r2Client.send(command);

    const baseUrl = R2_PUBLIC_URL.endsWith('/') ? R2_PUBLIC_URL : `${R2_PUBLIC_URL}/`;
    return `${baseUrl}${key}`;
  } catch (err) {
    console.error('Error uploading buffer to R2:', err);
    throw error(500, 'Failed to upload file');
  }
}

/**
 * Fetch an object from R2 and return its content as a Buffer.
 * Used for server-side zip generation.
 * @param key - Full R2 object key (e.g. "maps/mge_foo.bsp")
 */
export async function getObjectFromR2(key: string): Promise<Buffer> {
  if (!isR2Configured || !r2Client) {
    throw error(500, 'R2 storage is not configured');
  }

  try {
    const command = new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    });

    const response = await r2Client.send(command);

    if (!response.Body) {
      throw error(404, 'Object not found in R2');
    }

    // @aws-sdk/client-s3 returns a ReadableStream in Node.js — collect it
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } catch (err) {
    if ((err as { status?: number }).status) throw err; // re-throw SvelteKit errors
    console.error('Error fetching object from R2:', err);
    throw error(500, 'Failed to fetch file from storage');
  }
}

/**
 * Validate uploaded file
 * @param file - File object from form data
 * @param type - 'image', 'demo', 'bsp', or 'cfg'
 */
export function validateUploadedFile(
  file: File,
  type: 'image' | 'demo' | 'bsp' | 'cfg' = 'image',
): void {
  if (type === 'image') {
    // Check file size (5MB max for images)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      throw error(400, 'File size must be less than 5MB');
    }

    // Check file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      throw error(400, 'Only JPEG, PNG, GIF, and WebP files are allowed');
    }
  } else if (type === 'demo') {
    // Check file size (200MB max for demos)
    const maxSize = 200 * 1024 * 1024; // 200MB
    if (file.size > maxSize) {
      throw error(400, 'Demo file size must be less than 200MB');
    }

    // Check file extension (.dem files)
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.dem')) {
      throw error(400, 'Only .dem demo files are allowed');
    }
  } else if (type === 'bsp') {
    // Check file size (200MB max for BSP map files)
    const maxSize = 200 * 1024 * 1024; // 200MB
    if (file.size > maxSize) {
      throw error(400, 'BSP file size must be less than 200MB');
    }

    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.bsp')) {
      throw error(400, 'Only .bsp map files are allowed');
    }
  } else if (type === 'cfg') {
    // Check file size (1MB max for config files)
    const maxSize = 1 * 1024 * 1024; // 1MB
    if (file.size > maxSize) {
      throw error(400, 'CFG file size must be less than 1MB');
    }

    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.cfg')) {
      throw error(400, 'Only .cfg config files are allowed');
    }
  }
}

/**
 * Save uploaded file temporarily
 * @param file - File from form data
 * @returns Path to temporary file
 */
export async function saveTempFile(file: File): Promise<string> {
  const uploadDir = path.join(process.cwd(), 'uploads', 'temp');

  // Create directory if it doesn't exist
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  // Generate unique filename
  const ext = path.extname(file.name);
  const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}${ext}`;
  const filepath = path.join(uploadDir, filename);

  // Write file
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  fs.writeFileSync(filepath, buffer);

  return filepath;
}

/**
 * Delete temporary file
 * @param filepath - Path to temporary file
 */
export function deleteTempFile(filepath: string): void {
  try {
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }
  } catch (err) {
    console.error('Error deleting temp file:', err);
    // Don't throw - this is cleanup
  }
}
