# Claude.md - Obsidian Translation MCP Server 要件定義

## プロジェクト概要

Obsidian内のノートをClaude経由で直接翻訳・更新できるMCP (Model Context Protocol) Serverを構築する。ユーザーがObsidian URLと「日本語訳して」という指示をClaudeに伝えるだけで、該当ファイルが自動的に翻訳され、元のファイルが更新される。

## 主要機能

### 1. コア機能
- **Obsidian URL解析**: `obsidian://open?vault=VaultName&file=path/to/note.md` 形式のURLを解析
- **ファイル翻訳**: 指定されたノートの内容を日本語に翻訳
- **ファイル更新**: 翻訳後の内容で元のファイルを上書き
- **バックアップ作成**: 翻訳前の状態を自動バックアップ

### 2. 基本的なノート操作
- **ノート作成**: 新規ノートの作成（フォルダ指定、タグ付き）
- **ノート検索**: コンテンツやタイトルでの検索
- **ノート読み取り**: 特定のノートの内容取得
- **ノート更新**: 既存ノートの内容更新（上書き/追記）

### 3. 翻訳機能の詳細
- **Frontmatter保持**: YAMLフロントマターは翻訳せずに保持
- **コードブロック保護**: ` ``` ` で囲まれたコードは翻訳対象外
- **リンク保護**: `[[WikiLink]]` や `[Markdown](link)` 形式のリンクは維持
- **翻訳メタデータ追加**: 翻訳日時などの情報をFrontmatterに追記

## 技術スタック

```yaml
言語: TypeScript
ランタイム: Node.js
主要ライブラリ:
 - "@modelcontextprotocol/sdk": "^0.5.0"  # MCP SDK
 - "gray-matter": "^4.0.3"                # Frontmatter処理
 - "@anthropic-ai/sdk": "^0.24.0"         # Claude API（翻訳用）
 - "dotenv": "^16.0.0"                    # 環境変数管理
```

### ディレクトリ構造
```bash
obsidian-mcp-server/
├── src/
│   ├── index.ts              # MCPサーバーのエントリポイント
│   ├── tools/                # ツール定義
│   │   ├── translate.ts      # 翻訳関連ツール
│   │   ├── notes.ts          # 基本的なノート操作
│   │   └── search.ts         # 検索機能
│   ├── utils/
│   │   ├── obsidian-url.ts   # URL解析ユーティリティ
│   │   ├── file-system.ts    # ファイル操作ヘルパー
│   │   └── translation.ts    # 翻訳処理ロジック
│   └── types/
│       └── index.ts          # 型定義
├── dist/                     # ビルド出力
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

### 環境変数
```bash
# .env.example
OBSIDIAN_VAULT_PATH=/path/to/your/vault
ANTHROPIC_API_KEY=your-api-key-here
BACKUP_RETENTION_DAYS=30  # バックアップ保持期間
```

### セキュリティ要件

Vault制限: 環境変数で指定されたVault以外へのアクセスを禁止
パス検証: ディレクトリトラバーサル攻撃の防止
バックアップ必須: 破壊的操作前には必ずバックアップ作成
APIキー保護: 環境変数での管理、ログ出力禁止

### エラーハンドリング

```typescript
// エラーレスポンスの標準形式
interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
  };
}

// エラーコード定義
enum ErrorCode {
  INVALID_URL = "INVALID_OBSIDIAN_URL",
  FILE_NOT_FOUND = "FILE_NOT_FOUND",
  VAULT_MISMATCH = "VAULT_MISMATCH",
  TRANSLATION_FAILED = "TRANSLATION_FAILED",
  BACKUP_FAILED = "BACKUP_FAILED"
}
```

### 実装優先順位
#### hase 1: MVP（最小実装）

Obsidian URL解析機能
ファイル読み取り・書き込み
基本的な翻訳機能（Claude API統合）
バックアップ機能

#### Phase 2: 基本機能拡張

ノート作成・更新・検索機能
Frontmatter処理
コードブロック・リンク保護

#### Phase 3: 高度な機能

#### 部分翻訳（行範囲指定）
翻訳モード選択（置換/追記/並列表示）
Daily Notes対応
バッチ翻訳機能

設定ファイル例
claude_desktop_config.json
```json
{
  "mcpServers": {
    "obsidian-translator": {
      "command": "node",
      "args": ["./dist/index.js"],
      "cwd": "/path/to/obsidian-mcp-server",
      "env": {
        "OBSIDIAN_VAULT_PATH": "/Users/username/Documents/ObsidianVault",
        "ANTHROPIC_API_KEY": "sk-ant-...",
        "NODE_ENV": "production"
      }
    }
  }
}
```
### 使用例

- 基本的な翻訳

User: obsidian://open?vault=MyVault&file=Notes/English%20Article.md を日本語訳して
```bash
Claude: ファイルを翻訳しています...
✅ バックアップを作成しました: Notes/English Article.backup-1234567890.md
✅ 翻訳が完了しました
✅ ファイルを更新しました: Notes/English Article.md
```

### エラーケース

User: obsidian://open?vault=WrongVault&file=test.md を翻訳

```bash
Claude: ❌ エラー: Vault mismatch
指定されたVault 'WrongVault' は設定されたVault 'MyVault' と一致しません。
```

### テスト戦略

単体テスト: 各ユーティリティ関数のテスト
統合テスト: MCPプロトコルとの連携テスト
E2Eテスト: 実際のObsidian Vaultでの動作確認

### パフォーマンス考慮事項

大きなファイル（>1MB）の処理時のメモリ使用量
翻訳APIのレート制限への対応
並行処理の制御（同時翻訳数の制限）

### 今後の拡張可能性

他言語への翻訳対応
Obsidian Sync対応
プラグイン形式での提供
WebSocket経由でのリアルタイム翻訳