import { promises as fs } from 'fs';
import { join, dirname, basename, extname } from 'path';
import { BackupInfo, ErrorCode } from '../types/index.js';

export class FileSystemHelper {
  private vaultPath: string;
  private backupRetentionDays: number;

  constructor(vaultPath: string, backupRetentionDays: number = 30) {
    this.vaultPath = vaultPath;
    this.backupRetentionDays = backupRetentionDays;
  }

  /**
   * ファイルの絶対パスを取得
   * @param relativePath Vault内の相対パス
   * @returns 絶対パス
   */
  getAbsolutePath(relativePath: string): string {
    return join(this.vaultPath, relativePath);
  }

  /**
   * ファイルが存在するかチェック
   * @param filePath ファイルパス
   * @returns 存在する場合true
   */
  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(this.getAbsolutePath(filePath));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * ファイルを読み込み
   * @param filePath ファイルパス
   * @returns ファイル内容
   */
  async readFile(filePath: string): Promise<string> {
    try {
      const absolutePath = this.getAbsolutePath(filePath);
      return await fs.readFile(absolutePath, 'utf-8');
    } catch (error) {
      throw new Error(`${ErrorCode.FILE_NOT_FOUND}: Cannot read file '${filePath}': ${error}`);
    }
  }

  /**
   * ファイルを書き込み
   * @param filePath ファイルパス
   * @param content ファイル内容
   */
  async writeFile(filePath: string, content: string): Promise<void> {
    try {
      const absolutePath = this.getAbsolutePath(filePath);
      
      // ディレクトリが存在しない場合は作成
      await fs.mkdir(dirname(absolutePath), { recursive: true });
      
      await fs.writeFile(absolutePath, content, 'utf-8');
    } catch (error) {
      throw new Error(`${ErrorCode.PERMISSION_DENIED}: Cannot write file '${filePath}': ${error}`);
    }
  }

  /**
   * バックアップファイルを作成
   * @param filePath バックアップ対象のファイルパス
   * @returns バックアップ情報
   */
  async createBackup(filePath: string): Promise<BackupInfo> {
    try {
      const absolutePath = this.getAbsolutePath(filePath);
      const content = await fs.readFile(absolutePath, 'utf-8');
      
      // バックアップファイル名を生成
      const timestamp = Date.now();
      const ext = extname(filePath);
      const baseName = basename(filePath, ext);
      const dir = dirname(filePath);
      
      const backupFileName = `${baseName}.backup-${timestamp}${ext}`;
      const backupPath = join(dir, backupFileName);
      const backupAbsolutePath = this.getAbsolutePath(backupPath);
      
      // バックアップファイルを作成
      await fs.writeFile(backupAbsolutePath, content, 'utf-8');
      
      const stats = await fs.stat(backupAbsolutePath);
      
      return {
        originalPath: filePath,
        backupPath: backupPath,
        timestamp: new Date(timestamp).toISOString(),
        size: stats.size
      };
    } catch (error) {
      throw new Error(`${ErrorCode.BACKUP_FAILED}: Cannot create backup for '${filePath}': ${error}`);
    }
  }

  /**
   * 古いバックアップファイルを削除
   * @param directory 対象ディレクトリ
   */
  async cleanupOldBackups(directory: string = ''): Promise<void> {
    try {
      const dirPath = this.getAbsolutePath(directory);
      const files = await fs.readdir(dirPath, { withFileTypes: true });
      
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.backupRetentionDays);
      
      for (const file of files) {
        if (file.isFile() && file.name.includes('.backup-')) {
          const filePath = join(dirPath, file.name);
          const stats = await fs.stat(filePath);
          
          if (stats.mtime < cutoffDate) {
            await fs.unlink(filePath);
          }
        }
      }
    } catch (error) {
      // バックアップクリーンアップのエラーは警告レベルで処理
      console.warn(`Warning: Failed to cleanup old backups in '${directory}': ${error}`);
    }
  }

  /**
   * ファイルを検索
   * @param searchTerm 検索語
   * @param directory 検索ディレクトリ
   * @returns 検索結果
   */
  async searchFiles(searchTerm: string, directory: string = ''): Promise<string[]> {
    try {
      const dirPath = this.getAbsolutePath(directory);
      const files = await this.getAllMarkdownFiles(dirPath);
      const results: string[] = [];
      
      for (const file of files) {
        try {
          const content = await fs.readFile(file, 'utf-8');
          if (content.toLowerCase().includes(searchTerm.toLowerCase())) {
            // 相対パスに変換
            const relativePath = file.replace(this.vaultPath, '').replace(/^\//, '');
            results.push(relativePath);
          }
        } catch {
          // ファイル読み込みエラーは無視
        }
      }
      
      return results;
    } catch (error) {
      throw new Error(`Search failed: ${error}`);
    }
  }

  /**
   * ディレクトリ内のすべてのMarkdownファイルを取得
   * @param directory 検索ディレクトリ
   * @returns Markdownファイルのパス一覧
   */
  private async getAllMarkdownFiles(directory: string): Promise<string[]> {
    const files: string[] = [];
    
    try {
      const items = await fs.readdir(directory, { withFileTypes: true });
      
      for (const item of items) {
        const itemPath = join(directory, item.name);
        
        if (item.isDirectory() && !item.name.startsWith('.')) {
          // 隠しディレクトリ以外を再帰的に検索
          const subFiles = await this.getAllMarkdownFiles(itemPath);
          files.push(...subFiles);
        } else if (item.isFile() && item.name.endsWith('.md')) {
          files.push(itemPath);
        }
      }
    } catch {
      // ディレクトリアクセスエラーは無視
    }
    
    return files;
  }
}