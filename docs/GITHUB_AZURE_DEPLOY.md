# GitHub・Azure App Serviceデプロイ手順

Azure CLIを使用しない手順です。初回はVS CodeのAzure App Service拡張で手動デプロイし、その後はGitHub Actionsで自動再デプロイします。

## 1. Azure Portalで設定する環境変数

App Serviceの「設定」→「環境変数」に追加します。

```text
BRAIN_API_ENDPOINT=
BRAIN_API_PROJECT_ID_DRIVE=
BRAIN_API_PROJECT_ID_MAIL=
BRAIN_API_KEY=
AZURE_STORAGE_CONNECTION_STRING=
AZURE_STORAGE_CONTAINER=exam-data
ADMIN_PATH=<推測しにくい文字列>
ADMIN_PASSWORD=<管理者パスワード>
WEBSITE_SKIP_RUNNING_KUDUAGENT=false
```

まだBrainAPIを接続しない場合、最初の3項目は未設定で構いません。

「構成」→「全般設定」では次を設定します。

- Always On：オン
- スタートアップ コマンド：`node server.js`

## 2. 初回の手動デプロイ

```powershell
cd C:\Users\K24040482\Documents\secom_AI
npm ci
npm run check
powershell -ExecutionPolicy Bypass -File .\scripts\prepare-deploy.ps1
```

`deploy`フォルダーが作成されます。VS CodeのAzure App Service拡張で対象Web Appを選び、「Deploy to Web App...」から`deploy`フォルダーを指定します。

デプロイ後に以下を確認します。

```text
https://<Web-App名>.azurewebsites.net/
https://<Web-App名>.azurewebsites.net/api/health
https://<Web-App名>.azurewebsites.net/admin/<ADMIN_PATH>
```

## 3. GitHubにリポジトリを作る

1. GitHubのWeb画面で「New repository」を選択
2. Private repositoryとして作成
3. README、`.gitignore`、Licenseは追加せず空の状態で作成
4. 表示されたHTTPS URLをコピー

このPCではGitHub CLIは不要です。通常のGitとGit Credential Managerを使用できます。

```powershell
cd C:\Users\K24040482\Documents\secom_AI
git lfs install --local
git remote add origin https://github.com/<organization-or-user>/<repository>.git
git add .
git commit -m "Initial grade 4 certification exam app"
git push -u origin main
```

認証画面が表示された場合は、ブラウザでGitHubへログインします。63MBの試験動画はGit LFSで管理する設定済みです。

## 4. GitHub Actionsの設定

Azure PortalでApp Serviceの「概要」から発行プロファイルをダウンロードします。

GitHubリポジトリで：

1. `Settings`→`Secrets and variables`→`Actions`
2. `Variables`に`AZURE_WEBAPP_NAME`を追加し、Web App名を登録
3. `Secrets`に`AZURE_WEBAPP_PUBLISH_PROFILE`を追加し、発行プロファイルXML全体を登録

`.github/workflows/azure-app-service.yml`により、`main`ブランチへのpushでテスト、ビルド、App Serviceへの再デプロイが実行されます。

## 5. 動画の差し替え

新しいMP4を`public/training-video.mp4`へ上書きし、通常どおりcommitとpushを行います。

```powershell
git add public/training-video.mp4
git commit -m "Replace exam video"
git push
```
