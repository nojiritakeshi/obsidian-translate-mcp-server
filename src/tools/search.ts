import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { FileSystemHelper } from '../utils/file-system.js';
import { SearchResult, NoteMetadata, ErrorCode } from '../types/index.js';
import matter from 'gray-matter';

export class SearchTool {
  private fileSystem: FileSystemHelper;

  constructor(vaultPath: string, backupRetentionDays: number = 30) {
    this.fileSystem = new FileSystemHelper(vaultPath, backupRetentionDays);
  }

  /**
   * 検索ツールの定義を取得
   */
  static getSearchToolDefinition(): Tool {
    return {
      name: 'search_obsidian_notes',
      description: 'Search for notes in Obsidian vault by content or title',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query (searches in both title and content)'
          },
          directory: {
            type: 'string',
            description: 'Directory to search in (relative to vault root, optional)',
            default: ''
          },
          maxResults: {
            type: 'number',
            description: 'Maximum number of results to return',
            default: 10
          },
          includeContent: {
            type: 'boolean',
            description: 'Whether to include content excerpts in results',
            default: true
          }
        },
        required: ['query']
      }
    };
  }

  /**
   * タグ検索ツールの定義を取得
   */
  static getSearchByTagsToolDefinition(): Tool {
    return {
      name: 'search_obsidian_notes_by_tags',
      description: 'Search for notes by tags',
      inputSchema: {
        type: 'object',
        properties: {
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tags to search for'
          },
          matchMode: {
            type: 'string',
            enum: ['any', 'all'],
            description: 'Whether to match any tag or all tags',
            default: 'any'
          },
          maxResults: {
            type: 'number',
            description: 'Maximum number of results to return',
            default: 10
          }
        },
        required: ['tags']
      }
    };
  }

  /**
   * コンテンツまたはタイトルで検索
   * @param query 検索クエリ
   * @param directory 検索ディレクトリ
   * @param maxResults 最大結果数
   * @param includeContent コンテンツを含めるか
   * @returns 検索結果
   */
  async searchNotes(
    query: string,
    directory: string = '',
    maxResults: number = 10,
    includeContent: boolean = true
  ): Promise<SearchResult[]> {
    try {
      const files = await this.fileSystem.searchFiles(query, directory);
      const results: SearchResult[] = [];

      for (const filePath of files.slice(0, maxResults)) {
        try {
          const rawContent = await this.fileSystem.readFile(filePath);
          const { data: frontmatter, content } = matter(rawContent);
          
          const title = frontmatter.title || filePath.split('/').pop()?.replace('.md', '') || 'Untitled';
          
          // 検索語に一致する部分を抽出
          const excerpt = includeContent ? this.extractExcerpt(content, query) : '';
          
          // 一致数をカウント
          const titleMatches = (title.toLowerCase().match(new RegExp(query.toLowerCase(), 'g')) || []).length;
          const contentMatches = (content.toLowerCase().match(new RegExp(query.toLowerCase(), 'g')) || []).length;
          
          results.push({
            path: filePath,
            title,
            excerpt,
            matches: titleMatches + contentMatches
          });
        } catch (error) {
          // 個別のファイル読み込みエラーは無視
          console.warn(`Failed to read file ${filePath}:`, error);
        }
      }

      // 一致数でソート
      return results.sort((a, b) => b.matches - a.matches);
    } catch (error) {
      throw new Error(`Search failed: ${error}`);
    }
  }

  /**
   * タグで検索
   * @param tags 検索タグ
   * @param matchMode マッチモード
   * @param maxResults 最大結果数
   * @returns 検索結果
   */
  async searchNotesByTags(
    tags: string[],
    matchMode: 'any' | 'all' = 'any',
    maxResults: number = 10
  ): Promise<SearchResult[]> {
    try {
      // 全てのMarkdownファイルを検索
      const allFiles = await this.fileSystem.searchFiles('', '');
      const results: SearchResult[] = [];

      for (const filePath of allFiles) {
        try {
          const rawContent = await this.fileSystem.readFile(filePath);
          const { data: frontmatter, content } = matter(rawContent);
          
          const noteTags = frontmatter.tags || [];
          
          // タグマッチングの判定
          const matches = this.matchTags(noteTags, tags, matchMode);
          
          if (matches) {
            const title = frontmatter.title || filePath.split('/').pop()?.replace('.md', '') || 'Untitled';
            
            results.push({
              path: filePath,
              title,
              excerpt: this.extractExcerpt(content, tags.join(' '), 150),
              matches: noteTags.filter((tag: string) => tags.includes(tag)).length
            });
          }
        } catch (error) {
          // 個別のファイル読み込みエラーは無視
          console.warn(`Failed to read file ${filePath}:`, error);
        }
      }

      // 一致数でソート
      return results.sort((a, b) => b.matches - a.matches).slice(0, maxResults);
    } catch (error) {
      throw new Error(`Tag search failed: ${error}`);
    }
  }

  /**
   * 最近更新されたノートを取得
   * @param maxResults 最大結果数
   * @param days 過去何日分を対象とするか
   * @returns 最近更新されたノート
   */
  async getRecentlyModifiedNotes(
    maxResults: number = 10,
    days: number = 7
  ): Promise<NoteMetadata[]> {
    try {
      const allFiles = await this.fileSystem.searchFiles('', '');
      const results: NoteMetadata[] = [];
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      for (const filePath of allFiles) {
        try {
          const rawContent = await this.fileSystem.readFile(filePath);
          const { data: frontmatter } = matter(rawContent);
          
          const modifiedDate = new Date(frontmatter.modified || new Date());
          
          if (modifiedDate >= cutoffDate) {
            const title = frontmatter.title || filePath.split('/').pop()?.replace('.md', '') || 'Untitled';
            
            results.push({
              title,
              path: filePath,
              tags: frontmatter.tags || [],
              lastModified: modifiedDate,
              created: new Date(frontmatter.created || new Date())
            });
          }
        } catch (error) {
          // 個別のファイル読み込みエラーは無視
          console.warn(`Failed to read file ${filePath}:`, error);
        }
      }

      // 更新日時でソート
      return results
        .sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime())
        .slice(0, maxResults);
    } catch (error) {
      throw new Error(`Failed to get recently modified notes: ${error}`);
    }
  }

  /**
   * 関連ノートを検索
   * @param filePath 基準となるノートのパス
   * @param maxResults 最大結果数
   * @returns 関連ノート
   */
  async findRelatedNotes(
    filePath: string,
    maxResults: number = 5
  ): Promise<SearchResult[]> {
    try {
      const rawContent = await this.fileSystem.readFile(filePath);
      const { data: frontmatter, content } = matter(rawContent);
      
      const noteTags = frontmatter.tags || [];
      const noteTitle = frontmatter.title || '';
      
      // タグが一致するノートを検索
      const tagMatches = noteTags.length > 0 
        ? await this.searchNotesByTags(noteTags, 'any', maxResults * 2)
        : [];
      
      // タイトルの単語で検索
      const titleWords = noteTitle.split(' ').filter((word: string) => word.length > 2);
      const titleMatches = titleWords.length > 0
        ? await this.searchNotes(titleWords.join(' '), '', maxResults * 2, false)
        : [];
      
      // 結果をマージして重複を除去
      const allMatches = [...tagMatches, ...titleMatches];
      const uniqueMatches = Array.from(
        new Map(allMatches.map(item => [item.path, item])).values()
      );
      
      // 自分自身を除外
      const filteredMatches = uniqueMatches.filter(match => match.path !== filePath);
      
      return filteredMatches.slice(0, maxResults);
    } catch (error) {
      throw new Error(`Failed to find related notes: ${error}`);
    }
  }

  /**
   * 検索語に一致する部分の抜粋を抽出
   * @param content コンテンツ
   * @param query 検索クエリ
   * @param maxLength 最大長
   * @returns 抜粋
   */
  private extractExcerpt(content: string, query: string, maxLength: number = 200): string {
    const queryLower = query.toLowerCase();
    const contentLower = content.toLowerCase();
    
    const index = contentLower.indexOf(queryLower);
    if (index === -1) {
      return content.substring(0, maxLength).trim() + (content.length > maxLength ? '...' : '');
    }
    
    const start = Math.max(0, index - 50);
    const end = Math.min(content.length, index + queryLower.length + 50);
    
    let excerpt = content.substring(start, end).trim();
    
    if (start > 0) excerpt = '...' + excerpt;
    if (end < content.length) excerpt = excerpt + '...';
    
    return excerpt;
  }

  /**
   * タグマッチングの判定
   * @param noteTags ノートのタグ
   * @param searchTags 検索タグ
   * @param matchMode マッチモード
   * @returns マッチするかどうか
   */
  private matchTags(
    noteTags: string[],
    searchTags: string[],
    matchMode: 'any' | 'all'
  ): boolean {
    if (matchMode === 'all') {
      return searchTags.every(tag => noteTags.includes(tag));
    } else {
      return searchTags.some(tag => noteTags.includes(tag));
    }
  }
}