import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { FileSystemHelper } from '../utils/file-system.js';
import { NoteMetadata, ErrorCode } from '../types/index.js';
import matter from 'gray-matter';
import { join } from 'path';

export class NotesTool {
  private fileSystem: FileSystemHelper;

  constructor(vaultPath: string, backupRetentionDays: number = 30) {
    this.fileSystem = new FileSystemHelper(vaultPath, backupRetentionDays);
  }

  /**
   * ノート作成ツールの定義を取得
   */
  static getCreateNoteToolDefinition(): Tool {
    return {
      name: 'create_obsidian_note',
      description: 'Create a new Obsidian note with optional frontmatter and tags',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path for the new note (relative to vault root, e.g., "folder/note.md")'
          },
          title: {
            type: 'string',
            description: 'Title of the note'
          },
          content: {
            type: 'string',
            description: 'Content of the note'
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tags to add to the note'
          },
          template: {
            type: 'string',
            description: 'Template to use for the note (optional)'
          }
        },
        required: ['path', 'title', 'content']
      }
    };
  }

  /**
   * ノート読み取りツールの定義を取得
   */
  static getReadNoteToolDefinition(): Tool {
    return {
      name: 'read_obsidian_note',
      description: 'Read content of an existing Obsidian note',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the note (relative to vault root)'
          }
        },
        required: ['path']
      }
    };
  }

  /**
   * ノート更新ツールの定義を取得
   */
  static getUpdateNoteToolDefinition(): Tool {
    return {
      name: 'update_obsidian_note',
      description: 'Update an existing Obsidian note',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the note (relative to vault root)'
          },
          content: {
            type: 'string',
            description: 'New content for the note'
          },
          mode: {
            type: 'string',
            enum: ['replace', 'append', 'prepend'],
            description: 'Update mode: replace, append, or prepend content',
            default: 'replace'
          },
          createBackup: {
            type: 'boolean',
            description: 'Whether to create a backup before updating',
            default: true
          }
        },
        required: ['path', 'content']
      }
    };
  }

  /**
   * 新しいノートを作成
   * @param path ノートのパス
   * @param title ノートのタイトル
   * @param content ノートの内容
   * @param tags タグ（オプション）
   * @param template テンプレート（オプション）
   * @returns 作成されたノートの情報
   */
  async createNote(
    path: string,
    title: string,
    content: string,
    tags: string[] = [],
    template?: string
  ): Promise<NoteMetadata> {
    try {
      // ファイルが既に存在するかチェック
      if (await this.fileSystem.exists(path)) {
        throw new Error(`${ErrorCode.FILE_NOT_FOUND}: File '${path}' already exists`);
      }

      // .mdの拡張子を確認
      if (!path.endsWith('.md')) {
        path += '.md';
      }

      // Frontmatterを作成
      const frontmatter: any = {
        title,
        created: new Date().toISOString(),
        modified: new Date().toISOString()
      };

      if (tags.length > 0) {
        frontmatter.tags = tags;
      }

      // テンプレートが指定されている場合は適用
      let finalContent = content;
      if (template) {
        finalContent = template.replace('{{content}}', content);
      }

      // Frontmatterとコンテンツを結合
      const noteContent = matter.stringify(finalContent, frontmatter);

      // ファイルを作成
      await this.fileSystem.writeFile(path, noteContent);

      return {
        title,
        path,
        tags,
        lastModified: new Date(),
        created: new Date()
      };
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`${ErrorCode.PERMISSION_DENIED}: Failed to create note '${path}'`);
    }
  }

  /**
   * ノートを読み取り
   * @param path ノートのパス
   * @returns ノートの内容
   */
  async readNote(path: string): Promise<{ content: string; frontmatter: any }> {
    try {
      const rawContent = await this.fileSystem.readFile(path);
      const { data: frontmatter, content } = matter(rawContent);

      return {
        content,
        frontmatter
      };
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`${ErrorCode.FILE_NOT_FOUND}: Failed to read note '${path}'`);
    }
  }

  /**
   * ノートを更新
   * @param path ノートのパス
   * @param newContent 新しい内容
   * @param mode 更新モード
   * @param createBackup バックアップを作成するか
   * @returns 更新されたノートの情報
   */
  async updateNote(
    path: string,
    newContent: string,
    mode: 'replace' | 'append' | 'prepend' = 'replace',
    createBackup: boolean = true
  ): Promise<NoteMetadata> {
    try {
      // ファイルの存在確認
      if (!(await this.fileSystem.exists(path))) {
        throw new Error(`${ErrorCode.FILE_NOT_FOUND}: File '${path}' not found`);
      }

      // バックアップを作成
      if (createBackup) {
        await this.fileSystem.createBackup(path);
      }

      // 既存のコンテンツを読み取り
      const { content: existingContent, frontmatter } = await this.readNote(path);

      // 更新モードに応じてコンテンツを結合
      let finalContent: string;
      switch (mode) {
        case 'replace':
          finalContent = newContent;
          break;
        case 'append':
          finalContent = existingContent + '\\n\\n' + newContent;
          break;
        case 'prepend':
          finalContent = newContent + '\\n\\n' + existingContent;
          break;
        default:
          throw new Error(`${ErrorCode.TRANSLATION_FAILED}: Invalid mode '${mode}'`);
      }

      // Frontmatterを更新
      const updatedFrontmatter = {
        ...frontmatter,
        modified: new Date().toISOString()
      };

      // ファイルを更新
      const noteContent = matter.stringify(finalContent, updatedFrontmatter);
      await this.fileSystem.writeFile(path, noteContent);

      return {
        title: frontmatter.title || path.split('/').pop()?.replace('.md', '') || 'Untitled',
        path,
        tags: frontmatter.tags || [],
        lastModified: new Date(),
        created: new Date(frontmatter.created || new Date())
      };
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`${ErrorCode.PERMISSION_DENIED}: Failed to update note '${path}'`);
    }
  }

  /**
   * Daily Noteを作成
   * @param date 日付（オプション、デフォルトは今日）
   * @param template テンプレート（オプション）
   * @returns 作成されたDaily Noteの情報
   */
  async createDailyNote(
    date: Date = new Date(),
    template?: string
  ): Promise<NoteMetadata> {
    const dateStr = date.toISOString().split('T')[0];
    const path = join('Daily Notes', `${dateStr}.md`);
    
    const defaultContent = template || `# ${dateStr}

## Today's Tasks
- [ ] 

## Notes

## Reflections
`;

    return await this.createNote(
      path,
      dateStr,
      defaultContent,
      ['daily-note'],
      template
    );
  }

  /**
   * ノートのメタデータを取得
   * @param path ノートのパス
   * @returns ノートのメタデータ
   */
  async getNoteMetadata(path: string): Promise<NoteMetadata> {
    try {
      const { frontmatter } = await this.readNote(path);
      
      return {
        title: frontmatter.title || path.split('/').pop()?.replace('.md', '') || 'Untitled',
        path,
        tags: frontmatter.tags || [],
        lastModified: new Date(frontmatter.modified || new Date()),
        created: new Date(frontmatter.created || new Date())
      };
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`${ErrorCode.FILE_NOT_FOUND}: Failed to get metadata for '${path}'`);
    }
  }
}