export interface FileStats {
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
  size: number;
  mtime: Date;
  ctime: Date;
  atime: Date;
  mode: number;
}
/**
 * File system abstraction interface
 */
export interface IAsyncFileSystem {
  /**
   * Check if a file exists
   * @param path Path to check
   */

  exists(path: string): Promise<boolean>;

  /**
   * Read a file as text
   * @param path File path
   */
  readFile(path: string): Promise<string>;

  /**
   * Write text to a file
   * @param path File path
   * @param data Data to write
   */
  writeFile(path: string, data: string): Promise<void>;

  /**
   * Delete a file
   * @param path File path
   */
  deleteFile(path: string): Promise<void>;

  /**
   *  Synchronously delete a directory
   * @param path Directory path
   */
  deleteDir(path: string): Promise<void>;
  /**
   * Read a directory and return its contents
   * @param dirPath Directory path
   */
  readDir(dirPath: string): Promise<string[]>;

  /**
   * Ensure a directory exists
   * @param path Directory path
   */
  ensureDir(path: string): Promise<void>;

  /**
   * Set file permissions
   * @param path File path
   * @param mode Permission mode (octal)
   */
  chmod(path: string, mode: number): Promise<void>;

  /**
   * Get file statistics, custom type for flexibility
   * @param path File path
   */
  stat?(path: string): Promise<FileStats>;

  /**
   * Clear the contents of a directory (optional)
   * @param dirPath Directory path
   */
  clear?(dirPath: string): Promise<void>;
}
