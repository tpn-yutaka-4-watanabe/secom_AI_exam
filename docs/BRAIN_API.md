# BrainAPI接続仕様

この説明は、`C:\Users\K24040482\Documents\aicomm-testUI`にある既存実装のうち、次のファイルを確認して整理したものです。

- `server/src/services/brainApi.ts`
- `server/src/types/chat.ts`
- `android/BrainHiraganaChat/app/.../BrainApiClient.kt`

既存プロジェクト内にある実値のProject IDやAPI Keyは、本プロジェクトへ転記していません。

## 接続先

HTTP POSTで次のエンドポイントを呼び出します。

```text
<BrainAPI Base URL>/api/v1/prediction
```

このアプリの`BRAIN_API_ENDPOINT`は、Base URLと上記の完全なURLのどちらでも指定できます。

参照元 `aicomm-testUI/server/src/services/brainApi.ts` の既定URLは `https://brain.metaclone.jp`、したがって送信先は `https://brain.metaclone.jp/api/v1/prediction` です。本番App Serviceの実際の設定は `BRAIN_API_ENDPOINT` を確認してください（環境変数による上書きが優先されます）。

動画試験の新しい3項目形式に対応した設定案は [動画採点プロンプト](BRAIN_VIDEO_GRADING_PROMPT.md) を参照してください。動画用プロジェクトへの設定は別途必要です。

## 環境変数

App Serviceの「設定」→「環境変数」に登録します。

```text
BRAIN_API_ENDPOINT=https://<BrainAPI-host>
BRAIN_API_PROJECT_ID_DRIVE=<動画試験の採点用Project ID>
BRAIN_API_PROJECT_ID_MAIL=<メール試験の採点用Project ID>
BRAIN_API_KEY=<採点用API Key>
```

動画試験では`BRAIN_API_PROJECT_ID_DRIVE`、メール試験では`BRAIN_API_PROJECT_ID_MAIL`を使用します。エンドポイントとAPI Keyは両試験で共通です。

## リクエスト

```json
{
  "utterance": "採点指示と受験者の回答",
  "projectId": "環境変数から取得",
  "apiKey": "環境変数から取得",
  "uid": "提出ID-試験種別-実行回数",
  "stream": false,
  "state": {},
  "files": []
}
```

採点ではストリーミングを使用せず、通常のJSONまたはテキストレスポンスを待ちます。HTTP 2xx以外はエラーとして扱います。

## 3回の採点

各試験は別URLから個別に提出します。提出した試験について次の処理を行います。

1. 動画確認試験の提出では、動画用Project IDへ3回送信
2. メール対応試験の提出では、メール用Project IDへ3回送信
3. 各回の開始日時、終了日時、成功・失敗、メッセージ、生レスポンスを保存

各回は別の`uid`を使用し、`state`は空にして独立した採点として順番に実行します。一つの提出で別種の試験を採点することはありません。

## 未設定時の動作

接続情報がない場合でも回答は失われません。提出した試験の3回分について設定エラーを保存します。管理画面では、回答内容と各回のエラーを確認できます。設定後の新しい提出から実際のBrainAPI採点が行われます。

## 実装場所

- 接続処理：`lib/brain-api.ts`
- 提出API：`app/api/submissions/route.ts`
- 保存処理：`lib/submission-store.ts`
