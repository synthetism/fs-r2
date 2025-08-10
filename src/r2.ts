/**
 * Cloudflare R2 FileSystem Implementation
 *
 * Provides async filesystem operations using Cloudflare R2 (S3-compatible) storage.
 * Uses AWS SDK v3 for S3-compatible operations with R2 endpoints.
 *
 * Features:
 * - Full S3-compatible API through Cloudflare R2
 * - Async-only operations (no sync support for cloud storage)
 * - Intelligent caching for improved performance
 * - Directory simulation using object prefixes
 * - Concurrent operations support
 * - Comprehensive error handling
 *
 * @example
 * ```typescript
 * import { createCloudflareR2FileSystem } from '@synet/fs';
 *
 * const r2FS = createCloudflareR2FileSystem({
 *   accountId: 'your-account-id',
 *   accessKeyId: 'your-access-key',
 *   secretAccessKey: 'your-secret-key',
 *   bucket: 'my-bucket',
 *   region: 'auto' // R2 uses 'auto' region
 * });
 *
 * await r2FS.writeFile('config.json', JSON.stringify(config));
 * const data = await r2FS.readFile('config.json');
 * ```
 */

import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  type GetObjectCommandOutput,
  HeadObjectCommand,
  type HeadObjectCommandOutput,
  ListObjectsV2Command,
  type ListObjectsV2CommandOutput,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { FileStats, IAsyncFileSystem } from "./filesystem.interface";

/**
 * Configuration options for Cloudflare R2 FileSystem
 */
export interface CloudflareR2Options {
  /** Cloudflare account ID */
  accountId: string;
  /** R2 access key ID */
  accessKeyId: string;
  /** R2 secret access key */
  secretAccessKey: string;
  /** R2 bucket name */
  bucket: string;
  /** AWS region (use 'auto' for R2) */
  region?: string;
  /** Optional prefix for all operations (useful for namespacing) */
  prefix?: string;
  /** Custom R2 endpoint (auto-generated if not provided) */
  endpoint?: string;
}

/**
 * Cache entry for R2 object metadata
 */
interface R2CacheEntry {
  size: number;
  lastModified: Date;
  etag: string;
}

/**
 * Cloudflare R2 FileSystem implementation using S3-compatible API
 *
 * Provides async filesystem operations against Cloudflare R2 storage,
 * which is fully S3-compatible but with different pricing and performance characteristics.
 */
export class CloudflareR2FileSystem implements IAsyncFileSystem {
  private s3Client: S3Client;
  private options: Required<Omit<CloudflareR2Options, "endpoint">> & {
    endpoint?: string;
  };
  private cache = new Map<string, R2CacheEntry>();

  constructor(options: CloudflareR2Options) {
    // Set defaults and validate options
    this.options = {
      accountId: options.accountId,
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
      bucket: options.bucket,
      region: options.region || "auto",
      prefix: options.prefix || "",
      endpoint: options.endpoint,
    };

    if (!this.options.accountId) {
      throw new Error("[CloudflareR2FileSystem] accountId is required");
    }
    if (!this.options.accessKeyId) {
      throw new Error("[CloudflareR2FileSystem] accessKeyId is required");
    }
    if (!this.options.secretAccessKey) {
      throw new Error("[CloudflareR2FileSystem] secretAccessKey is required");
    }
    if (!this.options.bucket) {
      throw new Error("[CloudflareR2FileSystem] bucket is required");
    }

    // Generate R2 endpoint if not provided
    let endpoint =
      this.options.endpoint ||
      `https://${this.options.accountId}.r2.cloudflarestorage.com`;

    // Parse and normalize the endpoint - remove bucket name if included
    // Handle case where bucket is a subdomain: bucket.account.r2.cloudflarestorage.com
    if (endpoint.includes(`${this.options.bucket}.`)) {
      endpoint = endpoint.replace(`${this.options.bucket}.`, "");
    }

    // Handle case where bucket is at the end of path: .../bucket-name
    if (endpoint.endsWith(`/${this.options.bucket}`)) {
      endpoint = endpoint.slice(0, -`/${this.options.bucket}`.length);
    }

    // Ensure endpoint doesn't end with slash
    endpoint = endpoint.replace(/\/$/, "");

    // Initialize S3 client configured for Cloudflare R2
    this.s3Client = new S3Client({
      region: this.options.region,
      endpoint,
      credentials: {
        accessKeyId: this.options.accessKeyId,
        secretAccessKey: this.options.secretAccessKey,
      },
      // R2-specific configuration - CRITICAL for Cloudflare R2
      forcePathStyle: true,
      maxAttempts: 3,
      // Let AWS SDK handle TLS negotiation automatically
      requestHandler: {
        requestTimeout: 30000,
      },
    });
  }

  /**
   * Get the R2 object key with prefix applied
   */
  private getR2Key(path: string): string {
    const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
    return this.options.prefix
      ? `${this.options.prefix}/${normalizedPath}`
      : normalizedPath;
  }

  /**
   * Remove prefix from R2 object key to get local path
   */
  private getLocalPath(key: string): string {
    if (this.options.prefix && key.startsWith(`${this.options.prefix}/`)) {
      return key.slice(this.options.prefix.length + 1);
    }
    return key;
  }

  /**
   * Check if an error is a "not found" error
   */
  private isNotFoundError(error: unknown): boolean {
    const awsError = error as {
      name?: string;
      $metadata?: { httpStatusCode?: number };
    };
    return (
      awsError?.name === "NoSuchKey" ||
      awsError?.$metadata?.httpStatusCode === 404
    );
  }

  /**
   * Convert R2 response stream to string
   */
  private async streamToString(
    stream: ReadableStream | unknown,
  ): Promise<string> {
    if (!stream) return "";

    const chunks: Uint8Array[] = [];
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }

    const buffer = Buffer.concat(chunks);
    return buffer.toString("utf-8");
  }

  /**
   * Read file content from R2
   */
  async readFile(path: string): Promise<string> {
    try {
      const key = this.getR2Key(path);

      // Check cache first
      const cached = this.cache.get(key);
      if (cached) {
        // Note: In a real implementation, you might want to validate cache freshness
        // For now, we'll still fetch from R2 but cache metadata
      }

      const command = new GetObjectCommand({
        Bucket: this.options.bucket,
        Key: key,
      });

      const response: GetObjectCommandOutput =
        await this.s3Client.send(command);
      const content = await this.streamToString(response.Body);

      // Cache metadata
      if (response.ContentLength !== undefined && response.LastModified) {
        this.cache.set(key, {
          size: response.ContentLength,
          lastModified: response.LastModified,
          etag: response.ETag || "",
        });
      }

      return content;
    } catch (error: unknown) {
      if (this.isNotFoundError(error)) {
        throw new Error(`[CloudflareR2FileSystem] File not found: ${path}`);
      }
      throw new Error(
        `[CloudflareR2FileSystem] Failed to read file ${path}: ${error}`,
      );
    }
  }

  /**
   * Write file content to R2
   */
  async writeFile(path: string, content: string): Promise<void> {
    try {
      const key = this.getR2Key(path);

      const command = new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: key,
        Body: content,
        ContentType: this.getContentType(path),
      });

      const response = await this.s3Client.send(command);

      // Update cache
      this.cache.set(key, {
        size: Buffer.byteLength(content, "utf-8"),
        lastModified: new Date(),
        etag: response.ETag || "",
      });
    } catch (error: unknown) {
      throw new Error(
        `[CloudflareR2FileSystem] Failed to write file ${path}: ${error}`,
      );
    }
  }

  /**
   * Check if file exists in R2
   */
  async exists(path: string): Promise<boolean> {
    try {
      const key = this.getR2Key(path);

      // Check cache first
      if (this.cache.has(key)) {
        return true;
      }

      const command = new HeadObjectCommand({
        Bucket: this.options.bucket,
        Key: key,
      });

      const response: HeadObjectCommandOutput =
        await this.s3Client.send(command);

      // Cache metadata
      if (response.ContentLength !== undefined && response.LastModified) {
        this.cache.set(key, {
          size: response.ContentLength,
          lastModified: response.LastModified,
          etag: response.ETag || "",
        });
      }

      return true;
    } catch (error: unknown) {
      if (this.isNotFoundError(error)) {
        return false;
      }
      throw new Error(
        `[CloudflareR2FileSystem] Failed to check file existence for ${path}: ${error}`,
      );
    }
  }

  /**
   * Delete file from R2
   */
  async deleteFile(path: string): Promise<void> {
    try {
      const key = this.getR2Key(path);

      const command = new DeleteObjectCommand({
        Bucket: this.options.bucket,
        Key: key,
      });

      await this.s3Client.send(command);

      // Remove from cache
      this.cache.delete(key);
    } catch (error: unknown) {
      if (!this.isNotFoundError(error)) {
        throw new Error(
          `[CloudflareR2FileSystem] Failed to delete file ${path}: ${error}`,
        );
      }
      // Silently succeed if file doesn't exist
    }
  }

  /**
   * List directory contents (simulated using object prefixes)
   */
  async readDir(path: string): Promise<string[]> {
    try {
      const normalizedPath = path.endsWith("/") ? path : `${path}/`;
      const prefix = this.getR2Key(normalizedPath);

      const command = new ListObjectsV2Command({
        Bucket: this.options.bucket,
        Prefix: prefix,
        Delimiter: "/",
      });

      const response: ListObjectsV2CommandOutput =
        await this.s3Client.send(command);
      const entries: string[] = [];

      // Add files in current directory
      if (response.Contents) {
        for (const object of response.Contents) {
          if (object.Key && object.Key !== prefix) {
            const localPath = this.getLocalPath(object.Key);
            const fileName = localPath.substring(normalizedPath.length);
            if (fileName && !fileName.includes("/")) {
              entries.push(fileName);

              // Cache metadata
              if (object.Size !== undefined && object.LastModified) {
                this.cache.set(object.Key, {
                  size: object.Size,
                  lastModified: object.LastModified,
                  etag: object.ETag || "",
                });
              }
            }
          }
        }
      }

      // Add subdirectories
      if (response.CommonPrefixes) {
        for (const commonPrefix of response.CommonPrefixes) {
          if (commonPrefix.Prefix) {
            const localPath = this.getLocalPath(commonPrefix.Prefix);
            const dirName = localPath
              .substring(normalizedPath.length)
              .replace(/\/$/, "");
            if (dirName) {
              entries.push(`${dirName}/`);
            }
          }
        }
      }

      return entries.sort();
    } catch (error: unknown) {
      throw new Error(
        `[CloudflareR2FileSystem] Failed to read directory ${path}: ${error}`,
      );
    }
  }

  /**
   * Delete directory and all its contents from R2
   */
  async deleteDir(path: string): Promise<void> {
    try {
      const normalizedPath = path.endsWith("/") ? path : `${path}/`;
      const prefix = this.getR2Key(normalizedPath);

      // List all objects with the prefix
      const listCommand = new ListObjectsV2Command({
        Bucket: this.options.bucket,
        Prefix: prefix,
      });

      const listResponse: ListObjectsV2CommandOutput =
        await this.s3Client.send(listCommand);

      if (!listResponse.Contents || listResponse.Contents.length === 0) {
        return; // Directory is empty or doesn't exist
      }

      // Delete objects in batches (R2 supports batch delete like S3)
      const objects = listResponse.Contents.filter((obj) => obj.Key).map(
        (obj) => ({ Key: obj.Key as string }),
      );

      if (objects.length > 0) {
        const deleteCommand = new DeleteObjectsCommand({
          Bucket: this.options.bucket,
          Delete: {
            Objects: objects,
          },
        });

        await this.s3Client.send(deleteCommand);

        // Remove from cache
        for (const obj of objects) {
          this.cache.delete(obj.Key);
        }
      }
    } catch (error: unknown) {
      throw new Error(
        `[CloudflareR2FileSystem] Failed to delete directory ${path}: ${error}`,
      );
    }
  }

  /**
   * Get file statistics
   */
  async stat(path: string): Promise<FileStats> {
    try {
      const key = this.getR2Key(path);

      // Check cache first
      const cached = this.cache.get(key);
      if (cached) {
        return {
          size: cached.size,
          mtime: cached.lastModified,
          ctime: cached.lastModified,
          atime: cached.lastModified,
          mode: 0o644,
          isFile: () => true,
          isDirectory: () => false,
          isSymbolicLink: () => false,
        };
      }

      // Get from R2
      const command = new HeadObjectCommand({
        Bucket: this.options.bucket,
        Key: key,
      });

      const response: HeadObjectCommandOutput =
        await this.s3Client.send(command);

      const stats: FileStats = {
        size: response.ContentLength || 0,
        mtime: response.LastModified || new Date(),
        ctime: response.LastModified || new Date(),
        atime: response.LastModified || new Date(),
        mode: 0o644,
        isFile: () => true,
        isDirectory: () => false,
        isSymbolicLink: () => false,
      };

      // Cache the metadata
      this.cache.set(key, {
        size: stats.size,
        lastModified: stats.mtime,
        etag: response.ETag || "",
      });

      return stats;
    } catch (error: unknown) {
      if (this.isNotFoundError(error)) {
        throw new Error(`[CloudflareR2FileSystem] File not found: ${path}`);
      }
      throw new Error(
        `[CloudflareR2FileSystem] Failed to get file stats for ${path}: ${error}`,
      );
    }
  }

  /**
   * Get content type based on file extension
   */
  private getContentType(path: string): string {
    const ext = path.split(".").pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      json: "application/json",
      txt: "text/plain",
      md: "text/markdown",
      html: "text/html",
      css: "text/css",
      js: "application/javascript",
      ts: "application/typescript",
      xml: "application/xml",
      pdf: "application/pdf",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      svg: "image/svg+xml",
    };

    return mimeTypes[ext || ""] || "application/octet-stream";
  }

  /**
   * Ensure directory exists (no-op for R2 as directories are virtual)
   */
  async ensureDir(path: string): Promise<void> {
    // R2 (like S3) doesn't have real directories - they're simulated via prefixes
    // This is a no-op but we could optionally create a placeholder file
    return Promise.resolve();
  }

  /**
   * Change file permissions (no-op for R2 as it doesn't support POSIX permissions)
   */
  async chmod(path: string, mode: number): Promise<void> {
    // R2 doesn't support POSIX file permissions
    // This is a no-op for cloud storage compatibility
    return Promise.resolve();
  }

  /**
   * Get R2 bucket and configuration information
   */
  getBucketInfo(): {
    bucket: string;
    prefix: string;
    region: string;
    accountId: string;
    endpoint?: string;
  } {
    return {
      bucket: this.options.bucket,
      prefix: this.options.prefix,
      region: this.options.region,
      accountId: this.options.accountId,
      endpoint: this.options.endpoint,
    };
  }
}

/**
 * Factory function to create a new Cloudflare R2 FileSystem instance
 */
export function createCloudflareR2FileSystem(
  options: CloudflareR2Options,
): CloudflareR2FileSystem {
  return new CloudflareR2FileSystem(options);
}
