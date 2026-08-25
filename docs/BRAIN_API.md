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

最終提出時に次の処理を行います。

1. 動画確認試験の回答をBrainAPIへ3回送信
2. メール対応試験の回答をBrainAPIへ3回送信
3. 各回の開始日時、終了日時、成功・失敗、メッセージ、生レスポンスを保存

各回は別の`uid`を使用し、`state`は空にして独立した採点として実行します。動画試験とメール試験は並行処理し、それぞれの3回は順番に処理します。

## 未設定時の動作

接続情報がない場合でも回答は失われません。動画3件、メール3件の計6件について、設定エラーを保存します。管理画面では、回答内容と各回のエラーを確認できます。設定後の新しい提出から実際のBrainAPI採点が行われます。

## 実装場所

- 接続処理：`lib/brain-api.ts`
- 提出API：`app/api/submissions/route.ts`
- 保存処理：`lib/submission-store.ts`
