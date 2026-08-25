# Azure App Serviceデプロイ手順書（Azure CLI不使用）

この文書は、ローカルで作成したWebアプリをGitHubで管理し、Azure App Serviceへデプロイするまでの標準手順です。

- Azure CLIは使用しない
- AzureリソースはAzure Portalで作成する
- 初回はGitHub Actionsを手動実行する
- 2回目以降は`main`ブランチへのpushで自動再デプロイする
- アプリの永続データはAzure Blob Storageに保存する

## 最初に見るチェックリスト

初回デプロイでは、次の順番で作業します。

1. Azure PortalでApp Serviceを作成
2. Azure PortalでStorage AccountとBlobコンテナーを作成
3. App Serviceに環境変数とスタートアップ設定を登録
4. App ServiceのSCM基本認証を有効化
5. App Serviceの発行プロファイルをダウンロード
6. GitHubへソースコードをpush
7. GitHubへApp Service名をVariableとして登録
8. GitHubへ発行プロファイルをSecretとして登録
9. GitHub Actionsを実行
10. 規定ドメイン、ヘルスチェック、管理画面を確認

2回目以降は、原則として次の3コマンドだけです。

```powershell
git add .
git commit -m "変更内容を表すメッセージ"
git push
```

`git push`後、GitHub Actionsがテスト、ビルド、App Serviceへの再デプロイを自動実行します。

## 今回のデプロイ先

| 項目 | 値 |
|---|---|
| GitHub | `https://github.com/tpn-yutaka-4-watanabe/secom_AI_exam` |
| ブランチ | `main` |
| App Service名 | `secom-grade4-exam` |
| 規定ドメイン | `https://secom-grade4-exam-dacxdqaccadpbaf8.japaneast-01.azurewebsites.net/` |
| ヘルスチェック | `https://secom-grade4-exam-dacxdqaccadpbaf8.japaneast-01.azurewebsites.net/api/health` |
| GitHub Actions定義 | `.github/workflows/azure-app-service.yml` |

別のアプリでこの手順を使う場合は、GitHub URL、App Service名、規定ドメインをそのアプリの値に置き換えます。

## 全体の流れ

```text
ローカルPC
   │ git push
   ▼
GitHub mainブランチ
   │ GitHub Actions（テスト・ビルド・デプロイ）
   ▼
Azure App Service
   ├── BrainAPIへ採点依頼
   └── Azure Blob Storageへ提出内容と採点結果を保存
```

## 1. Azure PortalでApp Serviceを作成

Azure Portalの「App Services」で「作成」→「Webアプリ」を選びます。「Webアプリとデータベース」は使用しません。

基本設定の考え方は次のとおりです。

- 公開：コード
- ランタイム：Node.js 24（GitHub Actionsのビルド環境と合わせる）
- OS：Linux
- リージョン：利用場所に近いリージョン
- App Serviceプラン：想定同時利用人数とAlways Onの要否に合わせて選択

作成後、「概要」に表示される次の値を控えます。

- App Serviceのリソース名
- 規定ドメイン

GitHubで使用する`AZURE_WEBAPP_NAME`は規定ドメインではなく、App Serviceのリソース名です。今回の値は`secom-grade4-exam`です。

## 2. Storage AccountとBlobコンテナーを作成

1. Azure Portalで「ストレージ アカウント」を作成
2. 作成したストレージアカウントを開く
3. 「データ ストレージ」→「コンテナー」を開き、「+ コンテナー」を選択
4. `exam-data`という名前でコンテナーを作成
5. 匿名アクセスレベルは「プライベート」のままにする
6. 「セキュリティとネットワーク」→「アクセスキー」を開く
7. キーの「接続文字列」をコピー

コピーした接続文字列は、後述の`AZURE_STORAGE_CONNECTION_STRING`に登録します。GitHubやソースコードには保存しません。

## 3. App Serviceの環境変数を設定

App Serviceの「設定」→「環境変数」に次を登録し、保存します。

```text
BRAIN_API_ENDPOINT=<BrainAPIのベースURLまたは/api/v1/predictionまでのURL>
BRAIN_API_PROJECT_ID_DRIVE=<動画試験用Project ID>
BRAIN_API_PROJECT_ID_MAIL=<メール試験用Project ID>
BRAIN_API_KEY=<両試験共通のAPI Key>
AZURE_STORAGE_CONNECTION_STRING=<Storage Accountの接続文字列>
AZURE_STORAGE_CONTAINER=exam-data
ADMIN_PATH=<管理画面URL用の推測しにくい文字列>
ADMIN_PASSWORD=<管理画面のパスワード>
WEBSITE_SKIP_RUNNING_KUDUAGENT=false
```

BrainAPIの対応関係は次のとおりです。

| 試験 | Project ID |
|---|---|
| 動画確認試験 | `BRAIN_API_PROJECT_ID_DRIVE` |
| メール対応試験 | `BRAIN_API_PROJECT_ID_MAIL` |

`BRAIN_API_ENDPOINT`と`BRAIN_API_KEY`は両試験で共通です。

値を変更して保存するとApp Serviceが再起動することがあります。環境変数だけを変更した場合、通常はGitHubから再デプロイする必要はありません。

## 4. App Serviceの全般設定

App Serviceの「設定」→「構成」→「全般設定」で確認します。

- ランタイムスタック：Node.js 24
- Always On：オン
- スタートアップコマンド：`node server.js`

変更した場合は「保存」を押します。

## 5. 発行プロファイルをダウンロード

GitHub ActionsがApp Serviceへデプロイするため、発行プロファイルを使用します。

### 「基本認証は無効になっています」と表示された場合

1. App Serviceの「設定」→「構成」→「全般設定」を開く
2. `SCM Basic Auth Publishing Credentials`をオンにする
3. 「保存」を押す
4. 1分ほど待つ
5. App Serviceの「概要」へ戻る
6. 必要ならブラウザーを再読み込みする
7. 「発行プロファイルのダウンロード」を押す

GitHub Actionsで発行プロファイル方式を継続利用する間は、SCM基本認証をオンのままにします。FTPを使用しない場合、FTP基本認証を有効にする必要はありません。

ダウンロードされる`.PublishSettings`または`.publishsettings`ファイルにはデプロイ用資格情報が含まれます。Gitへ追加したり、メールやチャットへ貼り付けたりしないでください。

参考：[Azure App Serviceのデプロイ資格情報](https://learn.microsoft.com/azure/app-service/deploy-configure-credentials)

## 6. GitHubへソースコードを登録

新規リポジトリはREADME、`.gitignore`、Licenseを追加せず、空の状態で作成します。既存リポジトリを利用する場合はこの作成操作は不要です。

```powershell
cd C:\Users\K24040482\Documents\secom_AI
git lfs install --local
git remote add origin https://github.com/<ユーザーまたは組織>/<リポジトリ>.git
git add .
git commit -m "Initial application"
git push -u origin main
```

すでに`origin`が設定されている場合、`git remote add origin`は再実行しません。確認は次のコマンドで行います。

```powershell
git remote -v
git status
```

動画などの大きいファイルはGit LFSで管理します。このリポジトリでは`public/training-video.mp4`がGit LFS対象として設定済みです。

## 7. GitHubにApp Service名をVariableとして登録

GitHubで対象リポジトリを開き、次の順に移動します。

1. `Settings`
2. 左メニューの`Secrets and variables`
3. `Actions`
4. `Variables`タブ
5. `New repository variable`

登録内容：

```text
Name:  AZURE_WEBAPP_NAME
Value: secom-grade4-exam
```

別のアプリでは、`Value`をそのApp Serviceのリソース名に変更します。URL全体は入力しません。

参考：[GitHub ActionsのVariables](https://docs.github.com/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables)

## 8. GitHubに発行プロファイルをSecretとして登録

同じ`Settings`→`Secrets and variables`→`Actions`画面で操作します。

1. `Secrets`タブ
2. `New repository secret`
3. ダウンロードした発行プロファイルをメモ帳で開く
4. XMLを先頭から末尾まで全部コピー
5. 次の名前と値を登録

```text
Name:   AZURE_WEBAPP_PUBLISH_PROFILE
Secret: 発行プロファイルXMLの全文
```

ファイルをGitHubへアップロードするのではなく、中のXML全文をSecret欄へ貼り付けます。登録後、Secretの値はGitHub画面から再表示できません。

参考：[GitHub Actionsを使用したApp Serviceへのデプロイ](https://learn.microsoft.com/azure/app-service/deploy-github-actions)

## 9. 初回デプロイを実行

GitHubリポジトリで次の順に操作します。

1. `Actions`タブ
2. 左側の`Deploy to Azure App Service`
3. `Run workflow`
4. Branchが`main`であることを確認
5. `Run workflow`を押す

すでに失敗した実行がある場合は、その実行を開いて`Re-run jobs`→`Re-run all jobs`を選択します。

ワークフローでは次の処理を行います。

1. Git LFSを含めてソースコードを取得
2. Node.jsを準備
3. `npm ci`
4. 自動テスト
5. Next.jsの本番ビルド
6. デプロイパッケージを作成
7. Azure App Serviceへデプロイ

すべてのステップが緑色になればデプロイ成功です。

## 10. デプロイ後の確認

ブラウザーで次を確認します。

```text
https://<規定ドメイン>/
https://<規定ドメイン>/api/health
https://<規定ドメイン>/admin/<ADMIN_PATH>
```

今回の確認先：

```text
https://secom-grade4-exam-dacxdqaccadpbaf8.japaneast-01.azurewebsites.net/
https://secom-grade4-exam-dacxdqaccadpbaf8.japaneast-01.azurewebsites.net/api/health
https://secom-grade4-exam-dacxdqaccadpbaf8.japaneast-01.azurewebsites.net/admin/<ADMIN_PATH>
```

`/api/health`では次を確認します。

- `status`が`ok`
- `storage`がAzure Blob Storageを示している
- BrainAPIのエンドポイント、動画Project ID、メールProject ID、API Keyが設定済みになっている

実際の試験前に、テスト用の受験番号で1回提出し、管理画面で次を確認します。

- 回答が保存されている
- 動画試験のBrainAPI応答が3件ある
- メール試験のBrainAPI応答が3件ある
- 動画試験の前に「待機状態へ戻す」→「一斉再生」が動作する
- メール問題を管理画面で保存し、新しく開始したメール試験へ反映される

## 11. 2回目以降の通常デプロイ

作業前に最新の`main`を取得します。複数人で管理するときは必ず実行してください。

```powershell
cd C:\Users\K24040482\Documents\secom_AI
git pull --ff-only
```

変更後、ローカルで確認します。

```powershell
npm test
npm run lint
npm run build
```

問題がなければpushします。

```powershell
git add .
git commit -m "変更内容を表すメッセージ"
git push
```

`main`へのpushを検知してGitHub Actionsが自動実行されます。GitHubの`Actions`タブで緑色になるまで確認し、最後に規定ドメインを開きます。

## 12. 動画の差し替え

新しいMP4を次のファイルへ上書きします。

```text
public/training-video.mp4
```

その後、通常どおりcommitとpushを行います。

```powershell
git add public/training-video.mp4
git commit -m "Replace exam video"
git push
```

動画はGit LFSでアップロードされるため、通常のソースコードよりpushとGitHub Actionsに時間がかかります。

## 13. よくある問題

### AzureのWelcome画面が表示される

App Service自体は作成済みですが、アプリがまだデプロイされていません。GitHub Actionsを実行し、Deployステップまで成功しているか確認します。

### `/api/health`が`Cannot GET /api/health`または404になる

試験アプリではなくApp Serviceの初期ページや古いアプリが動作しています。GitHub Actionsの最新実行とスタートアップコマンド`node server.js`を確認します。

### 発行プロファイルをダウンロードできない

App Serviceの`SCM Basic Auth Publishing Credentials`をオンにして保存し、画面を再読み込みします。

### GitHub ActionsのDeployだけ失敗する

次を確認します。

- Variable名が`AZURE_WEBAPP_NAME`
- Variable値がURLではなくApp Service名
- Secret名が`AZURE_WEBAPP_PUBLISH_PROFILE`
- Secretに発行プロファイルXML全文が入っている
- 発行プロファイル取得後に資格情報をリセットしていない
- App ServiceのSCM基本認証がオン

### App Serviceが起動しない

次を確認します。

- ランタイムがNode.js
- スタートアップコマンドが`node server.js`
- GitHub ActionsのBuildとDeployが成功
- App Serviceの「ログストリーム」に起動エラーがない

### データがBlob Storageへ保存されない

次を確認します。

- `AZURE_STORAGE_CONNECTION_STRING`が接続文字列全体になっている
- `AZURE_STORAGE_CONTAINER`が`exam-data`
- Storage Accountに`exam-data`コンテナーが存在する
- `/api/health`の`storage`表示

## 14. 機密情報の扱い

次の値はGitへcommitしません。

- 発行プロファイル
- `BRAIN_API_KEY`
- Storage Accountの接続文字列
- `ADMIN_PASSWORD`
- 実値を記載した`.env`ファイル

発行プロファイルが外部へ漏れた可能性がある場合は、Azure Portalで発行プロファイルをリセットし、GitHubの`AZURE_WEBAPP_PUBLISH_PROFILE`を新しい内容へ更新します。
