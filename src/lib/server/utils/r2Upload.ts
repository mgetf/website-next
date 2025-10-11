/**
 * Cloudflare R2 Upload Utilities
 * Handles file uploads to R2 storage
 */

import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { error } from '@sveltejs/kit';
import fs from 'fs';
import path from 'path';

const R2_ENDPOINT = process.env.S3_EU_ENDPOINT || process.env.S3_ENDPOINT || '';
const R2_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY || '';
const R2_BUCKET_NAME = process.env.CLOUDFLARE_BUCKET_NAME || '';
const R2_PUBLIC_URL = process.env.CLOUDFLARE_PUBLIC_URL || '';

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
			secretAccessKey: R2_SECRET_ACCESS_KEY
		}
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
		const command = new PutObjectCommand({
			Bucket: R2_BUCKET_NAME,
			Key: remotePath,
			Body: fileContent,
			ContentType: contentType
		});

		await r2Client.send(command);

		// Return public URL
		const publicUrl = `${R2_PUBLIC_URL}images/${remotePath}`;
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
			Key: remotePath
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
 * Validate uploaded file
 * @param file - File object from form data
 * @param type - 'image' or 'demo'
 */
export function validateUploadedFile(file: File, type: 'image' | 'demo' = 'image'): void {
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

