import { ObsidianUrl, ErrorCode } from '../types/index.js';

export class ObsidianUrlParser {
  /**
   * Obsidian URLを解析して構造化された情報を返す
   * @param url obsidian:// 形式のURL
   * @returns 解析されたURL情報
   */
  static parse(url: string): ObsidianUrl {
    if (!url.startsWith('obsidian://')) {
      throw new Error(`${ErrorCode.INVALID_URL}: URL must start with 'obsidian://'`);
    }

    try {
      const urlObj = new URL(url);
      
      if (urlObj.pathname !== '/open') {
        throw new Error(`${ErrorCode.INVALID_URL}: Only 'open' action is supported`);
      }

      const vault = urlObj.searchParams.get('vault');
      const file = urlObj.searchParams.get('file');

      if (!vault) {
        throw new Error(`${ErrorCode.INVALID_URL}: Missing 'vault' parameter`);
      }

      if (!file) {
        throw new Error(`${ErrorCode.INVALID_URL}: Missing 'file' parameter`);
      }

      // URLデコード
      const decodedFile = decodeURIComponent(file);
      
      // パスの正規化
      const normalizedPath = decodedFile.replace(/\\/g, '/');
      
      return {
        vault: vault,
        file: decodedFile,
        path: normalizedPath
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('INVALID_OBSIDIAN_URL')) {
        throw error;
      }
      throw new Error(`${ErrorCode.INVALID_URL}: Failed to parse URL: ${error}`);
    }
  }

  /**
   * 設定されたVaultとリクエストされたVaultが一致するかチェック
   * @param requestedVault リクエストされたVault名
   * @param configuredVault 設定されたVault名
   * @throws エラーがある場合はthrowする
   */
  static validateVault(requestedVault: string, configuredVault: string): void {
    if (requestedVault !== configuredVault) {
      throw new Error(`${ErrorCode.VAULT_MISMATCH}: Requested vault '${requestedVault}' does not match configured vault '${configuredVault}'`);
    }
  }

  /**
   * ファイルパスのセキュリティチェック
   * @param filePath チェックするファイルパス
   * @throws 危険なパスの場合はthrowする
   */
  static validatePath(filePath: string): void {
    // ディレクトリトラバーサル攻撃の防止
    if (filePath.includes('..') || filePath.includes('~')) {
      throw new Error(`${ErrorCode.INVALID_PATH}: Path contains illegal characters`);
    }

    // 絶対パスの禁止
    if (filePath.startsWith('/') || filePath.match(/^[A-Za-z]:/)) {
      throw new Error(`${ErrorCode.INVALID_PATH}: Absolute paths are not allowed`);
    }

    // 隠しファイルの禁止
    if (filePath.split('/').some(part => part.startsWith('.'))) {
      throw new Error(`${ErrorCode.INVALID_PATH}: Hidden files are not allowed`);
    }
  }
}