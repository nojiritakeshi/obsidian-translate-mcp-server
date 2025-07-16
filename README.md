# Obsidian Translation MCP Server

Claude経由でObsidianのノートを直接翻訳・更新できるMCP (Model Context Protocol) Serverです。

## 主要機能

- 🌐 **Obsidian URL解析**: `obsidian://` URLから直接ノートを翻訳
- 🔄 **自動翻訳**: Claude APIを使用した高品質な翻訳
- 💾 **自動バックアップ**: 翻訳前の状態を自動で保存
- 📝 **ノート操作**: 基本的なCRUD操作（作成・読み取り・更新・検索）
- 🔍 **高度な検索**: コンテンツ、タグ、関連ノートの検索
- 🛡️ **セキュリティ**: Vault制限、パス検証、エラーハンドリング

## インストール

```bash
# リポジトリをクローン
git clone <repository-url>
cd obsidian-mcp-server

# 依存関係をインストール
npm install

# プロジェクトをビルド
npm run build
```

## 設定

1. `.env`ファイルを作成：
```bash
cp .env.example .env
```

2. 環境変数を設定：
```bash
# Obsidian Vaultのパス
OBSIDIAN_VAULT_PATH=/path/to/your/vault

# Anthropic APIキー
ANTHROPIC_API_KEY=sk-ant-...

# バックアップ保持期間（日数）
BACKUP_RETENTION_DAYS=30

# 環境設定
NODE_ENV=production
```

3. Claude Desktop設定ファイルを更新：
```json
{
  "mcpServers": {
    "obsidian-translator": {
      "command": "node",
      "args": ["./dist/index.js"],
      "cwd": "/path/to/obsidian-mcp-server",
      "env": {
        "OBSIDIAN_VAULT_PATH": "/path/to/your/vault",
        "ANTHROPIC_API_KEY": "sk-ant-...",
        "NODE_ENV": "production"
      }
    }
  }
}
```

## 使用方法

### 基本的な翻訳

```
obsidian://open?vault=MyVault&file=Notes/English%20Article.md を日本語訳して
```

### 利用可能なツール

1. **translate_obsidian_note**: ノートを翻訳
2. **create_obsidian_note**: 新しいノートを作成
3. **read_obsidian_note**: ノートを読み取り
4. **update_obsidian_note**: ノートを更新
5. **search_obsidian_notes**: コンテンツで検索
6. **search_obsidian_notes_by_tags**: タグで検索

## 翻訳機能の詳細

### 保護される要素
- ✅ YAMLフロントマター
- ✅ コードブロック (` ``` `)
- ✅ WikiLink (`[[リンク]]`)
- ✅ Markdownリンク (`[テキスト](URL)`)

### 翻訳モード
- `replace`: 元のファイルを置き換え（デフォルト）
- `append`: 翻訳を追記
- `parallel`: 並列版を作成（例：`note.ja.md`）

### 自動追加メタデータ
```yaml
translated:
  date: 2024-01-01T00:00:00.000Z
  target_language: 日本語
  model: claude-3-haiku-20240307
```

## 開発

### 開発モード
```bash
npm run dev
```

### テスト
```bash
npm test
```

### ビルド
```bash
npm run build
```

## トラブルシューティング

### よくある問題

1. **"Vault mismatch"エラー**
   - 環境変数のVaultパスとURL内のVault名が一致しているか確認

2. **"File not found"エラー**
   - ファイルパスが正しいか確認
   - ファイルが実際に存在するか確認

3. **"Permission denied"エラー**
   - Vaultディレクトリの読み書き権限を確認

### ログ確認
```bash
# サーバーログを確認
tail -f ~/.claude/logs/mcp-server.log
```

## セキュリティ

- 🔒 **Vault制限**: 指定されたVault以外へのアクセスを禁止
- 🛡️ **パス検証**: ディレクトリトラバーサル攻撃を防止
- 💾 **必須バックアップ**: 破壊的操作前に自動バックアップ
- 🔐 **APIキー保護**: 環境変数で管理、ログ出力禁止

## ライセンス

MIT License

## 作者

[Your Name]

## 貢献

バグ報告や機能要請は、GitHubのIssuesまでお願いします。

---

🔗 **関連リンク**
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Obsidian](https://obsidian.md/)
- [Claude API](https://docs.anthropic.com/claude/docs/)