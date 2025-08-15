# @synet/fs-r2

**Cloudflare R2 FileSystem Adapter** - Professional cloud storage with zero egress fees.

## Overview

Transform Cloudflare R2 into a familiar filesystem interface. Built on S3-compatible APIs with enterprise-grade reliability, global edge performance, and zero egress fees.

```typescript
import { createCloudflareR2FileSystem } from '@synet/fs-r2';

const r2FS = createCloudflareR2FileSystem({
  accountId: 'your-account-id',
  accessKeyId: 'your-access-key', 
  secretAccessKey: 'your-secret-key',
  bucket: 'my-bucket',
  region: 'auto'
});

await r2FS.writeFile('app.json', JSON.stringify(config));
const data = await r2FS.readFile('app.json');
```

## Why Cloudflare R2?

### **Global Edge Network**
- 275+ locations worldwide
- Sub-100ms latency globally 
- Automatic geographic optimization

### **Zero Egress Fees** 
- No data transfer charges
- Predictable pricing model
- Cost savings up to 90% vs alternatives

### **High Performance**
- S3-compatible API
- Built for speed and scale
- Integrated with Cloudflare's edge

### **Enterprise Security**
- Built-in DDoS protection
- Advanced encryption options
- Fine-grained access controls

## Installation

```bash
npm install @synet/fs-r2
```

## Quick Start

### 1. Get R2 Credentials

1. **Log into Cloudflare Dashboard**
2. **Navigate to R2 Object Storage**
3. **Create API Token:**
   - Go to "Manage R2 API Tokens"
   - Create token with "Object Read and Write" permissions
   - Save `Access Key ID` and `Secret Access Key`
4. **Note your Account ID** from dashboard URL

### 2. Create Bucket

```bash
# Using Wrangler CLI
wrangler r2 bucket create my-app-bucket

# Or via Cloudflare Dashboard
```

### 3. Initialize FileSystem

```typescript
import { createCloudflareR2FileSystem } from '@synet/fs-r2';

const r2FS = createCloudflareR2FileSystem({
  accountId: 'ddf6ea2efa179944a417844222f31b8d',
  accessKeyId: 'a5cd3fc2639388f5036fc16bca959ffb', 
  secretAccessKey: 'cb996804c7e7c49c475a8a83e0094d02f50b2cdb7a912f9601ebf96943ead319',
  bucket: 'my-app-bucket',
  region: 'auto', // R2 handles regions automatically
  prefix: 'app/' // Optional: namespace your files
});
```

## Core Operations

### File Management
```typescript
// Write files
await r2FS.writeFile('config.json', JSON.stringify(config));
await r2FS.writeFile('data.txt', 'Hello R2!');

// Read files  
const config = JSON.parse(await r2FS.readFile('config.json'));
const content = await r2FS.readFile('data.txt');

// File existence
if (await r2FS.exists('config.json')) {
  console.log('Config found');
}

// File stats
const stats = await r2FS.stat('config.json');
console.log(`Size: ${stats.size}, Modified: ${stats.mtime}`);
```

### Directory Operations
```typescript
// Create directory structure
await r2FS.mkdir('assets/images');
await r2FS.writeFile('assets/images/logo.png', imageBuffer);

// List directory contents
const files = await r2FS.readdir('assets');
console.log('Assets:', files); // ['images']

// List with details
const entries = await r2FS.readdir('assets', { withFileTypes: true });
entries.forEach(entry => {
  console.log(`${entry.name}: ${entry.isDirectory() ? 'DIR' : 'FILE'}`);
});
```

### Advanced Operations
```typescript
// Concurrent uploads
const uploads = [
  r2FS.writeFile('file1.txt', 'content1'),
  r2FS.writeFile('file2.txt', 'content2'), 
  r2FS.writeFile('file3.txt', 'content3')
];
await Promise.all(uploads);

// Bulk operations
await r2FS.copy('source.json', 'backup/source.json');
await r2FS.move('temp.txt', 'processed/temp.txt');

// Cleanup
await r2FS.unlink('temp.txt');
await r2FS.rmdir('old-folder');
```

## Configuration Options

```typescript
interface CloudflareR2Options {
  /** Cloudflare Account ID */
  accountId: string;
  
  /** R2 Access Key ID */
  accessKeyId: string;
  
  /** R2 Secret Access Key */
  secretAccessKey: string;
  
  /** R2 Bucket name */
  bucket: string;
  
  /** Region (use 'auto' for R2) */
  region?: string;
  
  /** Optional prefix for namespacing */
  prefix?: string;
  
  /** Custom endpoint (auto-generated if not provided) */
  endpoint?: string;
}
```

## Performance Features

### Intelligent Caching
```typescript
// Automatic caching for repeated reads
const data1 = await r2FS.readFile('config.json'); // Network request
const data2 = await r2FS.readFile('config.json'); // Cache hit (faster)
```

### Concurrent Operations
```typescript
// Process multiple files simultaneously
const files = ['file1.txt', 'file2.txt', 'file3.txt'];
const contents = await Promise.all(
  files.map(file => r2FS.readFile(file))
);
```

## Error Handling

```typescript
try {
  await r2FS.writeFile('protected/data.json', content);
} catch (error) {
  if (error.code === 'ENOENT') {
    // Directory doesn't exist
    await r2FS.mkdir('protected');
    await r2FS.writeFile('protected/data.json', content);
  } else if (error.code === 'EACCES') {
    // Permission denied
    console.error('Check R2 API permissions');
  } else {
    // Network or other error
    console.error('R2 operation failed:', error.message);
  }
}
```

## Best Practices

### Security
```typescript
// Use environment variables for credentials
const r2FS = createCloudflareR2FileSystem({
  accountId: process.env.R2_ACCOUNT_ID!,
  accessKeyId: process.env.R2_ACCESS_KEY_ID!,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  bucket: process.env.R2_BUCKET!,
  region: 'auto'
});
```

### Performance Optimization
```typescript
// Use prefixes for organization
const userFS = createCloudflareR2FileSystem({
  // ... credentials
  prefix: `users/${userId}/`
});

// Batch operations when possible
const operations = files.map(file => 
  r2FS.writeFile(file.path, file.content)
);
await Promise.all(operations);
```

### Multi-Region Setup
```typescript
// Primary region
const primaryR2 = createCloudflareR2FileSystem({
  // ... credentials
  bucket: 'app-primary',
  prefix: 'data/'
});

// Backup region  
const backupR2 = createCloudflareR2FileSystem({
  // ... credentials
  bucket: 'app-backup',
  prefix: 'data/'
});

// Sync critical data
await backupR2.writeFile('critical.json', 
  await primaryR2.readFile('critical.json')
);
```

## API Reference

### Async Operations
| Method | Description | Returns |
|--------|-------------|---------|
| `readFile(path)` | Read file contents | `Promise<string>` |
| `writeFile(path, data)` | Write file contents | `Promise<void>` |
| `unlink(path)` | Delete file | `Promise<void>` |
| `readdir(path)` | List directory | `Promise<string[]>` |
| `mkdir(path)` | Create directory | `Promise<void>` |
| `rmdir(path)` | Remove directory | `Promise<void>` |
| `stat(path)` | Get file stats | `Promise<FileStats>` |
| `exists(path)` | Check existence | `Promise<boolean>` |
| `copy(src, dest)` | Copy file/directory | `Promise<void>` |
| `move(src, dest)` | Move file/directory | `Promise<void>` |

## Integration Examples

### Next.js App
```typescript
// pages/api/upload.ts
import { createCloudflareR2FileSystem } from '@synet/fs-r2';

const r2FS = createCloudflareR2FileSystem({
  accountId: process.env.R2_ACCOUNT_ID!,
  accessKeyId: process.env.R2_ACCESS_KEY_ID!,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  bucket: 'app-uploads',
});

export default async function handler(req, res) {
  const { filename, content } = req.body;
  
  await r2FS.writeFile(`uploads/${filename}`, content);
  res.json({ success: true });
}
```

### Express Server
```typescript
import express from 'express';
import { createCloudflareR2FileSystem } from '@synet/fs-r2';

const app = express();
const r2FS = createCloudflareR2FileSystem({ /* config */ });

app.post('/files', async (req, res) => {
  try {
    await r2FS.writeFile(req.body.path, req.body.content);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

## Troubleshooting

### Connection Issues
```bash
# Test R2 endpoint connectivity
curl -v "https://[account-id].r2.cloudflarestorage.com"

# Verify credentials
wrangler r2 bucket list
```

### Common Solutions
- **SSL Handshake Failure**: Verify account ID matches credentials
- **Access Denied**: Check API token permissions 
- **Bucket Not Found**: Verify bucket name and region
- **Network Timeout**: Check firewall settings

## Related Packages

- **[@synet/fs](https://www.npmjs.com/package/@synet/fs)** - Core filesystem abstraction and Unit Architecture
- **[@synet/fs-azure](https://www.npmjs.com/package/@synet/fs-azure)** - Azure Blob Storage adapter
- **[@synet/fs-gcs](https://www.npmjs.com/package/@synet/fs-gcs)** - Google Cloud Storage adapter
- **[@synet/fs-s3](https://www.npmjs.com/package/@synet/fs-s3)** - AWS S3 storage adapter
- **[@synet/fs-linode](https://www.npmjs.com/package/@synet/fs-linode)** - Linode Object Storage adapter
- **[@synet/fs-memory](https://www.npmjs.com/package/@synet/fs-memory)** - In-memory storage adapter
- **[@synet/fs-github](https://www.npmjs.com/package/@synet/fs-github)** - Github as storage adapter

## License

MIT 

