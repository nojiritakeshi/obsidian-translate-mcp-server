#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { config } from 'dotenv';
import { TranslateTool } from './tools/translate.js';
import { NotesTool } from './tools/notes.js';
import { SearchTool } from './tools/search.js';
import { ErrorCode as ObsidianErrorCode } from './types/index.js';

// 環境変数を読み込み
config();

/**
 * Obsidian Translation MCP Server
 * 
 * ObsidianのノートをClaude経由で翻訳・操作するためのMCPサーバー
 */
class ObsidianMCPServer {
  private server: Server;
  private translateTool!: TranslateTool;
  private notesTool!: NotesTool;
  private searchTool!: SearchTool;

  constructor() {
    this.server = new Server(
      {
        name: 'obsidian-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.validateEnvironment();
    this.initializeTools();
    this.setupRequestHandlers();
  }

  /**
   * 環境変数の検証
   */
  private validateEnvironment(): void {
    const requiredEnvVars = ['OBSIDIAN_VAULT_PATH', 'ANTHROPIC_API_KEY'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }
  }

  /**
   * ツールの初期化
   */
  private initializeTools(): void {
    const vaultPath = process.env.OBSIDIAN_VAULT_PATH!;
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY!;
    const backupRetentionDays = parseInt(process.env.BACKUP_RETENTION_DAYS || '30');
    
    // Vault名を環境変数から取得（設定されていない場合はパスから推測）
    const configuredVault = process.env.OBSIDIAN_VAULT_NAME || 
      vaultPath.split('/').pop() || 
      'DefaultVault';

    this.translateTool = new TranslateTool(
      vaultPath,
      anthropicApiKey,
      configuredVault,
      backupRetentionDays
    );

    this.notesTool = new NotesTool(vaultPath, backupRetentionDays);
    this.searchTool = new SearchTool(vaultPath, backupRetentionDays);
  }

  /**
   * リクエストハンドラーの設定
   */
  private setupRequestHandlers(): void {
    // ツール一覧の取得
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          TranslateTool.getToolDefinition(),
          NotesTool.getCreateNoteToolDefinition(),
          NotesTool.getReadNoteToolDefinition(),
          NotesTool.getUpdateNoteToolDefinition(),
          SearchTool.getSearchToolDefinition(),
          SearchTool.getSearchByTagsToolDefinition(),
        ],
      };
    });

    // ツール実行の処理
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'translate_obsidian_note':
            return await this.handleTranslateNote(args);
          
          case 'create_obsidian_note':
            return await this.handleCreateNote(args);
          
          case 'read_obsidian_note':
            return await this.handleReadNote(args);
          
          case 'update_obsidian_note':
            return await this.handleUpdateNote(args);
          
          case 'search_obsidian_notes':
            return await this.handleSearchNotes(args);
          
          case 'search_obsidian_notes_by_tags':
            return await this.handleSearchNotesByTags(args);
          
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        
        // カスタムエラーコードの処理
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorCode = this.mapErrorCode(errorMessage);
        
        throw new McpError(errorCode, errorMessage);
      }
    });
  }

  /**
   * 翻訳ノートの処理
   */
  private async handleTranslateNote(args: any) {
    const { url, targetLanguage, mode } = args;
    
    if (!url) {
      throw new McpError(ErrorCode.InvalidParams, 'URL is required');
    }

    const result = await this.translateTool.execute({
      url,
      targetLanguage,
      mode
    });

    return {
      content: [
        {
          type: 'text',
          text: `✅ 翻訳が完了しました\\n\\n` +
                `📁 ファイル: ${url}\\n` +
                `🔄 バックアップ: ${result.backupPath}\\n` +
                `⏰ 実行時刻: ${result.timestamp}\\n\\n` +
                `翻訳後のコンテンツ:\\n${result.translatedContent.substring(0, 500)}${result.translatedContent.length > 500 ? '...' : ''}`
        }
      ]
    };
  }

  /**
   * ノート作成の処理
   */
  private async handleCreateNote(args: any) {
    const { path, title, content, tags, template } = args;
    
    if (!path || !title || !content) {
      throw new McpError(ErrorCode.InvalidParams, 'Path, title, and content are required');
    }

    const result = await this.notesTool.createNote(path, title, content, tags, template);

    return {
      content: [
        {
          type: 'text',
          text: `✅ ノートが作成されました\\n\\n` +
                `📁 パス: ${result.path}\\n` +
                `📝 タイトル: ${result.title}\\n` +
                `🏷️ タグ: ${result.tags.join(', ') || 'なし'}\\n` +
                `📅 作成日時: ${result.created.toISOString()}`
        }
      ]
    };
  }

  /**
   * ノート読み取りの処理
   */
  private async handleReadNote(args: any) {
    const { path } = args;
    
    if (!path) {
      throw new McpError(ErrorCode.InvalidParams, 'Path is required');
    }

    const result = await this.notesTool.readNote(path);

    return {
      content: [
        {
          type: 'text',
          text: `📖 ノートの内容:\\n\\n` +
                `📁 パス: ${path}\\n` +
                `📝 メタデータ: ${JSON.stringify(result.frontmatter, null, 2)}\\n\\n` +
                `📄 コンテンツ:\\n${result.content}`
        }
      ]
    };
  }

  /**
   * ノート更新の処理
   */
  private async handleUpdateNote(args: any) {
    const { path, content, mode, createBackup } = args;
    
    if (!path || !content) {
      throw new McpError(ErrorCode.InvalidParams, 'Path and content are required');
    }

    const result = await this.notesTool.updateNote(path, content, mode, createBackup);

    return {
      content: [
        {
          type: 'text',
          text: `✅ ノートが更新されました\\n\\n` +
                `📁 パス: ${result.path}\\n` +
                `📝 タイトル: ${result.title}\\n` +
                `🔄 更新モード: ${mode || 'replace'}\\n` +
                `⏰ 更新日時: ${result.lastModified.toISOString()}`
        }
      ]
    };
  }

  /**
   * ノート検索の処理
   */
  private async handleSearchNotes(args: any) {
    const { query, directory, maxResults, includeContent } = args;
    
    if (!query) {
      throw new McpError(ErrorCode.InvalidParams, 'Query is required');
    }

    const results = await this.searchTool.searchNotes(
      query,
      directory,
      maxResults,
      includeContent
    );

    const resultsText = results.map(result => 
      `📁 ${result.path}\\n` +
      `📝 ${result.title}\\n` +
      `🎯 一致数: ${result.matches}\\n` +
      `📄 抜粋: ${result.excerpt}\\n`
    ).join('\\n---\\n\\n');

    return {
      content: [
        {
          type: 'text',
          text: `🔍 検索結果 (${results.length}件):\\n\\n${resultsText}`
        }
      ]
    };
  }

  /**
   * タグ検索の処理
   */
  private async handleSearchNotesByTags(args: any) {
    const { tags, matchMode, maxResults } = args;
    
    if (!tags || !Array.isArray(tags)) {
      throw new McpError(ErrorCode.InvalidParams, 'Tags array is required');
    }

    const results = await this.searchTool.searchNotesByTags(
      tags,
      matchMode,
      maxResults
    );

    const resultsText = results.map(result => 
      `📁 ${result.path}\\n` +
      `📝 ${result.title}\\n` +
      `🎯 一致数: ${result.matches}\\n` +
      `📄 抜粋: ${result.excerpt}\\n`
    ).join('\\n---\\n\\n');

    return {
      content: [
        {
          type: 'text',
          text: `🏷️ タグ検索結果 (${results.length}件):\\n` +
                `検索タグ: ${tags.join(', ')}\\n` +
                `マッチモード: ${matchMode}\\n\\n${resultsText}`
        }
      ]
    };
  }

  /**
   * エラーコードのマッピング
   */
  private mapErrorCode(errorMessage: string): ErrorCode {
    if (errorMessage.includes(ObsidianErrorCode.INVALID_URL)) {
      return ErrorCode.InvalidParams;
    }
    if (errorMessage.includes(ObsidianErrorCode.FILE_NOT_FOUND)) {
      return ErrorCode.InvalidParams;
    }
    if (errorMessage.includes(ObsidianErrorCode.VAULT_MISMATCH)) {
      return ErrorCode.InvalidParams;
    }
    if (errorMessage.includes(ObsidianErrorCode.PERMISSION_DENIED)) {
      return ErrorCode.InternalError;
    }
    
    return ErrorCode.InternalError;
  }

  /**
   * サーバーを起動
   */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    console.error('🚀 Obsidian MCP Server started');
  }
}

// メイン実行
async function main() {
  try {
    const server = new ObsidianMCPServer();
    await server.start();
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// 未処理の例外をキャッチ
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// 直接実行時のみmain関数を実行
main();