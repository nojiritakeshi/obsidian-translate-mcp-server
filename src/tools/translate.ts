import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ObsidianUrlParser } from '../utils/obsidian-url.js';
import { FileSystemHelper } from '../utils/file-system.js';
import { TranslationService } from '../utils/translation.js';
import { TranslationRequest, TranslationResult, ErrorCode } from '../types/index.js';

export class TranslateTool {
  private fileSystem: FileSystemHelper;
  private translationService: TranslationService;
  private configuredVault: string;

  constructor(
    vaultPath: string,
    anthropicApiKey: string,
    configuredVault: string,
    backupRetentionDays: number = 30
  ) {
    this.fileSystem = new FileSystemHelper(vaultPath, backupRetentionDays);
    this.translationService = new TranslationService(anthropicApiKey);
    this.configuredVault = configuredVault;
  }

  /**
   * MCPツールの定義を取得
   */
  static getToolDefinition(): Tool {
    return {
      name: 'translate_obsidian_note',
      description: 'Translate an Obsidian note from obsidian:// URL and update the original file',
      inputSchema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'Obsidian URL in format: obsidian://open?vault=VaultName&file=path/to/note.md'
          },
          targetLanguage: {
            type: 'string',
            description: 'Target language for translation (default: 日本語)',
            default: '日本語'
          },
          mode: {
            type: 'string',
            enum: ['replace', 'append', 'parallel'],
            description: 'Translation mode: replace original, append translation, or create parallel version',
            default: 'replace'
          }
        },
        required: ['url']
      }
    };
  }

  /**
   * 翻訳を実行
   * @param request 翻訳リクエスト
   * @returns 翻訳結果
   */
  async execute(request: TranslationRequest): Promise<TranslationResult> {
    try {
      // URLを解析
      const parsedUrl = ObsidianUrlParser.parse(request.url);
      
      // Vaultの検証
      ObsidianUrlParser.validateVault(parsedUrl.vault, this.configuredVault);
      
      // パスの検証
      ObsidianUrlParser.validatePath(parsedUrl.path);
      
      // ファイルの存在確認
      if (!(await this.fileSystem.exists(parsedUrl.path))) {
        throw new Error(`${ErrorCode.FILE_NOT_FOUND}: File '${parsedUrl.path}' not found`);
      }

      // 元のファイルを読み込み
      const originalContent = await this.fileSystem.readFile(parsedUrl.path);
      
      // バックアップを作成
      const backupInfo = await this.fileSystem.createBackup(parsedUrl.path);
      
      // 翻訳を実行
      const translatedContent = await this.translationService.translateContent(
        originalContent,
        request.targetLanguage || '日本語'
      );

      // 翻訳モードに応じてファイルを更新
      await this.updateFileByMode(
        parsedUrl.path,
        originalContent,
        translatedContent,
        request.mode || 'replace'
      );

      // 古いバックアップをクリーンアップ
      await this.fileSystem.cleanupOldBackups(parsedUrl.path.split('/').slice(0, -1).join('/'));

      return {
        originalContent,
        translatedContent,
        backupPath: backupInfo.backupPath,
        timestamp: backupInfo.timestamp
      };
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`${ErrorCode.TRANSLATION_FAILED}: Unknown error occurred`);
    }
  }

  /**
   * 翻訳モードに応じてファイルを更新
   * @param filePath ファイルパス
   * @param originalContent 元のコンテンツ
   * @param translatedContent 翻訳されたコンテンツ
   * @param mode 翻訳モード
   */
  private async updateFileByMode(
    filePath: string,
    originalContent: string,
    translatedContent: string,
    mode: 'replace' | 'append' | 'parallel'
  ): Promise<void> {
    switch (mode) {
      case 'replace':
        await this.fileSystem.writeFile(filePath, translatedContent);
        break;

      case 'append':
        const appendedContent = originalContent + '\\n\\n---\\n\\n# 翻訳版\\n\\n' + translatedContent;
        await this.fileSystem.writeFile(filePath, appendedContent);
        break;

      case 'parallel':
        // 並列表示用の新しいファイルを作成
        const parallelPath = filePath.replace(/\\.md$/, '.ja.md');
        await this.fileSystem.writeFile(parallelPath, translatedContent);
        break;

      default:
        throw new Error(`${ErrorCode.TRANSLATION_FAILED}: Invalid mode '${mode}'`);
    }
  }

  /**
   * バッチ翻訳を実行
   * @param urls 翻訳対象のURL配列
   * @param targetLanguage 翻訳先言語
   * @returns 翻訳結果の配列
   */
  async executeBatch(
    urls: string[],
    targetLanguage: string = '日本語'
  ): Promise<TranslationResult[]> {
    const results: TranslationResult[] = [];
    
    for (const url of urls) {
      try {
        const result = await this.execute({
          url,
          targetLanguage,
          mode: 'replace'
        });
        results.push(result);
      } catch (error) {
        console.error(`Failed to translate ${url}:`, error);
        // エラーが発生した場合はスキップして続行
      }
    }
    
    return results;
  }
}