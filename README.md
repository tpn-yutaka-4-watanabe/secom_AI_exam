# グレード4認定試験

動画確認試験とメール対応試験を、それぞれ独立したURLで実施するWebアプリです。各試験の提出時に対応するBrainAPI Projectへ3回送信し、回答と採点レスポンスを保存します。

## 画面

- `/`：動画試験・メール試験の選択
- `/video-test`：受験情報を入力し、管理者の一斉再生に合わせて指摘箇所とあるべき対応を記録・提出
- `/email-test`：受験情報を入力し、顧客からの受領メールへの返信を作成・提出
- `/complete`：受付番号と提出状況を表示
- `/admin/<ADMIN_PATH>`：動画の一斉再生、メール問題の編集、回答・BrainAPI 3回分の結果確認
- `/api/health`：StorageとBrainAPI設定状況の確認

## ローカル実行

```powershell
npm install
npm run dev
```

`http://localhost:3000`を開きます。環境変数が未設定の場合、回答は`data/submissions`、試験設定は`data/settings`へ保存され、BrainAPIの3回分は設定エラーとして記録されます。

ローカル管理画面の初期値：

```text
URL      http://localhost:3000/admin/preview
Password grade4-preview
```

Azureでは`ADMIN_PATH`と`ADMIN_PASSWORD`をApp Serviceの環境変数で変更してください。

## 環境変数

`.env.example`を参照してください。BrainAPIの詳細は[docs/BRAIN_API.md](docs/BRAIN_API.md)、GitHubとAzureの手順は[docs/GITHUB_AZURE_DEPLOY.md](docs/GITHUB_AZURE_DEPLOY.md)に記載しています。

## 確認

```powershell
npm run check
```
