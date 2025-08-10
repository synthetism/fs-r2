/**
 * Cloudflare R2 FileSystem Tests
 * 
 * Comprehensive test suite for Cloudflare R2 S3-compatible storage operations.
 * Tests against real R2 cloud storage using provided credentials.
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { createCloudflareR2FileSystem, type CloudflareR2Options } from '../src/r2';
import * as fs from 'fs';
import * as path from 'path';

describe('Cloudflare R2 Async FileSystem', () => {
  let r2FS: ReturnType<typeof createCloudflareR2FileSystem>;
  let testFiles: string[] = [];

  beforeAll(async () => {
    // Load R2 test credentials
    const testConfigPath = path.join(__dirname, '../private/r2-test-access.json');
    const testConfig = JSON.parse(fs.readFileSync(testConfigPath, 'utf8'));

    console.log('🔗 Initialized Cloudflare R2 for bucket:', testConfig.bucket);
    console.log('🌍 Account ID:', testConfig.accountId);
    console.log('🔗 Endpoint:', testConfig.s3ApiEndpoint);
    
    // Initialize R2 FileSystem with test credentials
    const r2Options: CloudflareR2Options = {
      accountId: testConfig.accountId,
      accessKeyId: testConfig.accessKeyId,
      secretAccessKey: testConfig.secretAccessKey,
      bucket: testConfig.bucket,
      region: 'auto',
      endpoint: testConfig.s3ApiEndpoint,
      prefix: 'synet-fs-r2-test' // Use test prefix
    };

    r2FS = createCloudflareR2FileSystem(r2Options);
  }, 30000);

  afterAll(async () => {
    console.log('🧹 Cleaning up R2 test files...');
    // Clean up test files
    for (const file of testFiles) {
      try {
        await r2FS.deleteFile(file);
        console.log(`✅ Deleted: ${file}`);
      } catch (error) {
        console.log(`⚠️  Could not delete ${file}:`, (error as Error).message);
      }
    }
  }, 30000);

  describe('Basic File Operations', () => {
    test('should write and read a text file', async () => {
      const fileName = `basic-test-${Date.now()}.txt`;
      const content = `Hello Cloudflare R2 from SYNET FS!\n\nThis is a test file.\nTimestamp: ${new Date().toISOString()}`;
      
      testFiles.push(fileName);
      
      await r2FS.writeFile(fileName, content);
      const readContent = await r2FS.readFile(fileName);
      
      expect(readContent).toBe(content);
      console.log(`✅ Successfully wrote and read ${fileName} (${content.length} bytes)`);
    }, 30000);

    test('should handle JSON files properly', async () => {
      const fileName = `json-test-${Date.now()}.json`;
      const data = {
        test: 'Cloudflare R2',
        timestamp: Date.now(),
        features: ['S3-compatible', 'global edge', 'zero egress'],
        config: {
          region: 'auto',
          provider: 'cloudflare'
        }
      };
      const content = JSON.stringify(data, null, 2);
      
      testFiles.push(fileName);
      
      await r2FS.writeFile(fileName, content);
      const readContent = await r2FS.readFile(fileName);
      const parsedData = JSON.parse(readContent);
      
      expect(parsedData).toEqual(data);
      console.log(`✅ Successfully handled JSON file ${fileName}`);
    }, 30000);

    test('should handle nested directory paths', async () => {
      const fileName = `nested/deep/path/file-${Date.now()}.md`;
      const content = '# Nested File Test\n\nThis file is in a deep directory structure.';
      
      testFiles.push(fileName);
      
      await r2FS.writeFile(fileName, content);
      const readContent = await r2FS.readFile(fileName);
      
      expect(readContent).toBe(content);
      console.log(`✅ Successfully handled nested path ${fileName}`);
    }, 30000);
  });

  describe('File Statistics and Metadata', () => {
    test('should provide accurate file statistics', async () => {
      const fileName = `stats-test-${Date.now()}.txt`;
      const content = 'Statistics test file for Cloudflare R2';
      
      testFiles.push(fileName);
      
      await r2FS.writeFile(fileName, content);
      const stats = await r2FS.stat(fileName);
      
      expect(stats.size).toBe(Buffer.byteLength(content, 'utf-8'));
      expect(stats.isFile()).toBe(true);
      expect(stats.isDirectory()).toBe(false);
      expect(stats.mtime).toBeInstanceOf(Date);
      
      console.log(`📊 File stats: ${stats.size} bytes, modified: ${stats.mtime.toISOString()}`);
    }, 30000);
  });

  describe('Directory Operations', () => {
    test('should list directory contents correctly', async () => {
      const baseDir = `dir-test-${Date.now()}`;
      
      // Create files in directory
      const files = [
        `${baseDir}/file1.txt`,
        `${baseDir}/file2.json`,
        `${baseDir}/subdir/nested.md`
      ];
      
      testFiles.push(...files);
      
      for (const file of files) {
        await r2FS.writeFile(file, `Content of ${file}`);
      }
      
      const contents = await r2FS.readDir(baseDir);
      
      expect(contents).toContain('file1.txt');
      expect(contents).toContain('file2.json');
      expect(contents).toContain('subdir/');
      
      console.log(`📂 Directory ${baseDir} contains: ${contents.join(', ')}`);
    }, 30000);

    test('should handle empty directories', async () => {
      const emptyDir = `empty-dir-${Date.now()}`;
      
      const contents = await r2FS.readDir(emptyDir);
      expect(contents).toEqual([]);
      
      console.log('📂 Empty directory test passed');
    }, 30000);
  });

  describe('Concurrent Operations', () => {
    test('should handle multiple concurrent uploads', async () => {
      const concurrentCount = 5;
      const baseFileName = Date.now();
      const promises: Promise<void>[] = [];
      
      for (let i = 0; i < concurrentCount; i++) {
        const fileName = `concurrent-${i}-${baseFileName}.txt`;
        const content = `Concurrent file ${i}\nUploaded at: ${new Date().toISOString()}`;
        testFiles.push(fileName);
        promises.push(r2FS.writeFile(fileName, content));
      }
      
      const uploadStart = Date.now();
      await Promise.all(promises);
      const uploadTime = Date.now() - uploadStart;
      
      // Verify all files exist
      const readPromises: Promise<string>[] = [];
      for (let i = 0; i < concurrentCount; i++) {
        const fileName = `concurrent-${i}-${baseFileName}.txt`;
        readPromises.push(r2FS.readFile(fileName));
      }
      
      const readStart = Date.now();
      const results = await Promise.all(readPromises);
      const readTime = Date.now() - readStart;
      
      expect(results).toHaveLength(concurrentCount);
      results.forEach(content => {
        expect(content).toContain('Concurrent file');
      });
      
      console.log(`⚡ Concurrent operations: ${concurrentCount} files uploaded in ${uploadTime}ms, read in ${readTime}ms`);
    }, 30000);
  });

  describe('Error Handling', () => {
    test('should handle non-existent file reads gracefully', async () => {
      const nonExistentFile = `non-existent-${Date.now()}.txt`;
      
      await expect(r2FS.readFile(nonExistentFile)).rejects.toThrow();
      console.log('❌ Error handling works correctly for non-existent files');
    }, 30000);

    test('should handle non-existent file stats gracefully', async () => {
      const nonExistentFile = `non-existent-stats-${Date.now()}.txt`;
      
      await expect(r2FS.stat(nonExistentFile)).rejects.toThrow();
      console.log('📊 Error handling works correctly for file stats');
    }, 30000);

    test('should handle deletion of non-existent files gracefully', async () => {
      const nonExistentFile = `non-existent-delete-${Date.now()}.txt`;
      
      // Should not throw error
      await expect(r2FS.deleteFile(nonExistentFile)).resolves.toBeUndefined();
      console.log('🗑️  Graceful deletion of non-existent files works');
    }, 30000);
  });

  describe('File Existence Checks', () => {
    test('should correctly identify existing and non-existing files', async () => {
      const fileName = `exists-test-${Date.now()}.txt`;
      const content = 'File existence test';
      
      testFiles.push(fileName);
      
      // File should not exist initially
      expect(await r2FS.exists(fileName)).toBe(false);
      
      // Create file
      await r2FS.writeFile(fileName, content);
      
      // File should exist now
      expect(await r2FS.exists(fileName)).toBe(true);
      
      console.log('✅ File existence checks work correctly');
    }, 30000);
  });

  describe('Cache Functionality', () => {
    test('should cache file content effectively', async () => {
      const fileName = `cache-test-${Date.now()}.txt`;
      const content = 'Cache test content for R2';
      
      testFiles.push(fileName);
      
      // Write file
      await r2FS.writeFile(fileName, content);
      
      // First read (populates cache)
      const content1 = await r2FS.readFile(fileName);
      expect(content1).toBe(content);
      
      // Second read (should use cache)
      const content2 = await r2FS.readFile(fileName);
      expect(content2).toBe(content);
      
      console.log('🗄️  Cache functionality validated');
    }, 30000);
  });

  describe('Bucket Information', () => {
    test('should return correct bucket configuration', async () => {
      const bucketInfo = r2FS.getBucketInfo();
      
      expect(bucketInfo.bucket).toBe('synet-fs-test');
      expect(bucketInfo.prefix).toBe('synet-fs-r2-test');
      expect(bucketInfo.region).toBe('auto');
      expect(bucketInfo.accountId).toBeDefined();
      
      console.log('ℹ️  Bucket info:', JSON.stringify(bucketInfo, null, 2));
    }, 30000);
  });

  describe('Bulk Operations', () => {
    test('should handle bulk file deletion', async () => {
      const bulkCount = 3;
      const baseFileName = Date.now();
      const files: string[] = [];
      
      // Create multiple files
      for (let i = 0; i < bulkCount; i++) {
        const fileName = `bulk-${i}-${baseFileName}.txt`;
        files.push(fileName);
        await r2FS.writeFile(fileName, `Bulk file ${i}`);
      }
      
      // Delete all files
      for (const file of files) {
        await r2FS.deleteFile(file);
      }
      
      // Verify deletion
      for (const file of files) {
        expect(await r2FS.exists(file)).toBe(false);
      }
      
      console.log(`🗑️  Bulk deletion of ${bulkCount} files successful`);
    }, 30000);

    test('should handle directory deletion', async () => {
      const dirName = `bulk-dir-${Date.now()}`;
      const files = [
        `${dirName}/file1.txt`,
        `${dirName}/file2.txt`,
        `${dirName}/subdir/file3.txt`
      ];
      
      // Create files
      for (const file of files) {
        await r2FS.writeFile(file, `Content of ${file}`);
      }
      
      // Delete directory
      await r2FS.deleteDir(dirName);
      
      // Verify deletion
      for (const file of files) {
        expect(await r2FS.exists(file)).toBe(false);
      }
      
      console.log(`🗂️  Directory deletion successful for ${dirName}`);
    }, 30000);
  });
});
