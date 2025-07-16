import Anthropic from '@anthropic-ai/sdk';
import matter from 'gray-matter';
import { TranslationResult, ErrorCode } from '../types/index.js';

export class TranslationService {
  private anthropic: Anthropic;

  constructor(apiKey: string) {
    this.anthropic = new Anthropic({
      apiKey: apiKey,
    });
  }

  /**
   * テキストを翻訳する
   * @param content 翻訳するコンテンツ
   * @param targetLanguage 翻訳先言語
   * @returns 翻訳結果
   */
  async translateContent(
    content: string,
    targetLanguage: string = '日本語'
  ): Promise<string> {
    try {
      // Frontmatterを分離
      const { data: frontmatter, content: bodyContent } = matter(content);
      
      // コンテンツが空の場合はそのまま返す
      if (!bodyContent.trim()) {
        return content;
      }

      // 翻訳用のプロンプトを作成
      const prompt = this.createTranslationPrompt(bodyContent, targetLanguage);

      const response = await this.anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 4000,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      const translatedContent = response.content[0].type === 'text' 
        ? response.content[0].text 
        : bodyContent;

      // 翻訳メタデータをFrontmatterに追加
      const updatedFrontmatter = {
        ...frontmatter,
        translated: {
          date: new Date().toISOString(),
          target_language: targetLanguage,
          model: 'claude-3-haiku-20240307'
        }
      };

      // Frontmatterと翻訳されたコンテンツを結合
      const result = matter.stringify(translatedContent, updatedFrontmatter);
      
      return result;
    } catch (error) {
      throw new Error(`${ErrorCode.TRANSLATION_FAILED}: Translation failed: ${error}`);
    }
  }

  /**
   * 翻訳用のプロンプトを作成
   * @param content 翻訳するコンテンツ
   * @param targetLanguage 翻訳先言語
   * @returns プロンプト
   */
  private createTranslationPrompt(content: string, targetLanguage: string): string {
    return `以下のMarkdownテキストを${targetLanguage}に翻訳してください。

翻訳時の注意事項：
1. コードブロック（\`\`\`で囲まれた部分）は翻訳しないでください
2. WikiLink形式（[[リンク]]）とMarkdownリンク形式（[テキスト](URL)）は構造を保持してください
3. 見出し（#）の階層構造は保持してください
4. 箇条書きやナンバリングの形式は保持してください
5. 自然で読みやすい${targetLanguage}に翻訳してください
6. 技術用語は適切な日本語に翻訳するか、必要に応じて英語のまま残してください

翻訳するテキスト：
${content}

翻訳されたテキストのみを出力してください。説明や追加のコメントは不要です。`;
  }

  /**
   * コードブロックを保護する（翻訳前処理）
   * @param content コンテンツ
   * @returns 保護されたコンテンツとプレースホルダーのマップ
   */
  private protectCodeBlocks(content: string): { content: string; placeholders: Map<string, string> } {
    const placeholders = new Map<string, string>();
    let counter = 0;

    // インラインコードを保護
    let protectedContent = content.replace(/`([^`]+)`/g, (match, code) => {
      const placeholder = `__INLINE_CODE_${counter++}__`;
      placeholders.set(placeholder, match);
      return placeholder;
    });

    // コードブロックを保護
    protectedContent = protectedContent.replace(/```[\\s\\S]*?```/g, (match) => {
      const placeholder = `__CODE_BLOCK_${counter++}__`;
      placeholders.set(placeholder, match);
      return placeholder;
    });

    return { content: protectedContent, placeholders };
  }

  /**
   * 保護されたコードブロックを復元する（翻訳後処理）
   * @param content 翻訳されたコンテンツ
   * @param placeholders プレースホルダーのマップ
   * @returns 復元されたコンテンツ
   */
  private restoreCodeBlocks(content: string, placeholders: Map<string, string>): string {
    let restoredContent = content;
    
    placeholders.forEach((original, placeholder) => {
      restoredContent = restoredContent.replace(placeholder, original);
    });

    return restoredContent;
  }

  /**
   * バッチ翻訳（複数ファイル）
   * @param contents 翻訳するコンテンツの配列
   * @param targetLanguage 翻訳先言語
   * @returns 翻訳結果の配列
   */
  async translateBatch(
    contents: string[],
    targetLanguage: string = '日本語'
  ): Promise<string[]> {
    const results: string[] = [];
    
    // 同時実行数を制限
    const batchSize = 3;
    
    for (let i = 0; i < contents.length; i += batchSize) {
      const batch = contents.slice(i, i + batchSize);
      
      const batchPromises = batch.map(content => 
        this.translateContent(content, targetLanguage)
      );
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          // エラーの場合は元のコンテンツを返す
          results.push(contents[results.length]);
        }
      }
    }
    
    return results;
  }
}