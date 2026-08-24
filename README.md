# グレード4認定試験

動画確認試験とメール対応試験を実施し、最終提出時にBrainAPIへ各3回送信して、回答と採点レスポンスを保存するWebアプリです。

## 画面

- `/`：受験番号・受験者名の入力、試験開始
- `/video-test`：左側の動画を見ながら右側の表形式で指摘事項を記録
- `/email-test`：顧客からの受領メールを読み、営業担当者として返信を作成
- `/complete`：受付番号と提出状況を表示
- `/admin/<ADMIN_PATH>`：回答・BrainAPI 3回分の結果を確認する管理画面
- `/api/health`：StorageとBrainAPI設定状況の確認

## ローカル実行

```powershell
npm install
npm run dev
```

`http://localhost:3000`を開きます。環境変数が未設定の場合、回答は`data/submissions`へ保存され、BrainAPIの3回分は設定エラーとして記録されます。

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
