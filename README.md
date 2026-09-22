# 将棋 BoardReader

[公開サイト](https://cocabot.github.io/shogi-boardreader/) — iPhoneで将棋本のPDFを読みながら、同じ画面で手順を並べる静的Webアプリです。上にPDF、下に将棋盤を表示します。

## 使い方

1. Safariで公開サイトを開き、「PDFを開く」から端末のPDFを選びます。
2. 自由盤では駒をタップ→移動先をタップ、またはドラッグ。駒取り・持ち駒からの駒打ち・成り／不成・待った／やり直しに対応します。
3. 「棋譜を開く」で購入特典などの `.kif` / `.ki2` / `.csa` を選ぶと棋譜再生に切り替わります。
4. 「先頭」「前の手」「次の手」「最後」で再生。「棋譜一覧」の手をタップしてジャンプできます。
5. 「棋譜一覧」の「変化」選択でKIFの分岐（入れ子を含む）を切り替え、「本譜に戻る」で本譜の開始局面に戻ります。現在手のコメントも表示します。
6. 再生中に駒を動かしたい場合は「棋譜一覧」→「この局面で検討」。原譜は変えず自由盤で試せます。「棋譜に戻る」または手送りで原譜へ復帰します。

中央のバーを上下にドラッグして表示比率を調整します。50:50ボタンで等分に戻せます（画面が非常に低い場合は盤の最小領域を優先）。キーボードではバーにフォーカスして上下矢印、Homeで等分。狭い縦画面でも9×9盤と駒文字がマス内に収まるよう、盤の実寸から文字サイズを計算します。後手の駒は180度回転、成駒は朱色、最終手は緑の枠、選択マスは濃い緑で表示します。反転時には座標と上下の持ち駒も入れ替わります。

自由盤は読書・検討用です。合法手・王手・二歩は強制しません。自由盤と分割比率のみlocalStorageへ保存し、保存できない環境でも利用できます。PDFと棋譜は再読み込み時に選び直してください。Safariの「ホーム画面に追加」に対応しますが、オフライン起動を保証するPWAキャッシュはありません。

## 日本語PDF表示

従来は `getDocument({ data })` のみで、外部CMap・標準フォントの場所が未指定でした。現在は **pdfjs-dist 6.3.289 のlegacy版**と同じバージョンの以下の資源を、すべてこのサイト内に同梱します。

- worker: `vendor/pdfjs/pdf.worker.min.mjs`
- Adobe CMap: `cMapUrl` + `cMapPacked: true`（Adobe-Japan1 / Japanese CIDを含む）
- 標準フォント: `standardFontDataUrl`
- 画像デコーダ等: `wasmUrl`
- 未埋め込みフォント: `useSystemFonts: true`
- 通常は `disableFontFace: false`。埋め込みフォントをブラウザのFontFaceで描画します。

「表示設定」→「文字互換表示」を有効にすると、PDFを端末内で再読み込みして `disableFontFace: true` に切り替えます。埋め込みフォントの輪郭描画を使うため、Safariのフォント読込が原因の欠落を回避できる場合があります。未埋め込みの特殊フォント・独自外字・壊れたPDFの字形を復元する機能ではありません。CMapは文字コードの対応表であり、すべての日本語フォントの字形を含むものではありません。`standard_fonts`も汎用の日本語駒フォント集ではありません。

まだ欠ける場合は「Safariで開く」で元のPDFをblob URLから端末内で開けます。パスワード付きPDFには入力画面を出します。パスワードを保存・送信しません。

PDF.jsは遅延読込し、PDF用資源が読めなくても自由盤・棋譜は動作します。ページ切替では描画キャンセルの完了を待ってcanvasを再利用し、別PDFへ切り替えると旧document／workerを破棄します。高解像度・拡大時はcanvasを最大400万画素、辺4096px以内、最大DPR 2に制限します。互換性優先でOffscreenCanvasとImageDecoderを無効にしています。

**マイナビ出版の購入PDFそのものは未検証です。** Japanese CID・標準フォント・描画競合の対策を行っていますが、特定書籍の完全再現を保証するものではありません。問題を報告する際は書名、ページ、iOSバージョン、通常／文字互換の違いを添えると切り分けしやすくなります。書籍PDFを公開リポジトリへ添付しないでください。

## 棋譜の対応範囲

解析・分岐・局面復元には [tsshogi](https://github.com/sunfish-shogi/tsshogi) 2.3.4（MIT）を使用します。

| 項目 | 対応 |
| --- | --- |
| KIF / KIFU | 平手、駒落ち、開始局面図、コメント、変化手順 |
| KI2 / KI2U | 「同」、成り／不成、打ち、右左上引等の指し手を解析 |
| CSA | 1対局の局面・手順・終局 |
| 文字コード | UTF-8（BOM有無）、Shift-JIS/CP932、BOM付きUTF-16 |
| サイズ | 1ファイル5MBまで |

棋譜一覧の総手数は、選択中の分岐の長さです。投了・中断等の終局行も1ステップとして表示します。複数対局を含むCSAは誤って一部だけ表示しないようエラーにし、1対局ずつの選択を求めます。独自形式、破損ファイル、ZIP内の一括読込、棋譜の編集・保存は対象外です。読込失敗時は直前の盤面・棋譜を維持します。

## プライバシーと構成

PDF・棋譜はFile APIで読み、端末内で処理します。ファイル内容・ファイル名・パスワードをサーバーや分析サービスへ送る処理はありません。PDF.js資源も同一サイトからGETするだけです。「Safariで開く」もローカルのblob URLです。初回ページアクセスや静的資源取得に通常のWeb通信は発生します。

UIはHTML / CSS / JavaScript。アプリのフレームワークは使いません。ビルド時のみesbuildで棋譜ライブラリをまとめ、PDF.js資源をコピーします。Pagesのサブディレクトリで動く相対パスを使用します。配信対象は `dist/` のみです。

## 開発・テスト

Node.js 24を使用します。

```sh
npm ci
node tests/make-fixtures.mjs
npm test
npm run build
npm start
# http://localhost:8000/
```

ブラウザ回帰テスト:

```sh
npx playwright install --with-deps chromium webkit
npm run test:e2e
```

GitHub Actionsは単体テスト、ビルド、ChromiumとWebKitのモバイル設定でのE2Eを実行し、成功したmainのみGitHub Pagesへデプロイします。失敗時のスクリーンショット・トレースとテストレポートは7日間保存します。

テスト項目: 320/375/390/430pxの縦画面、分割比率、駒・文字のマス内包含、自由盤の移動と復元、KIF/KI2/CSA、Shift-JIS、変化・検討復帰、Japanese CIDの実描画、連続ページ送り、文字互換、canvas上限、ファイル操作時に同一オリジンのGET以外の通信がないこと。

`tests/make-fixtures.mjs` は独自の日本語CIDテキストと線を持つPDF、およびShift-JIS棋譜を生成します。出版社のコンテンツは含みません。WebKitの自動試験は実際のiPhone Safariの代わりにはなりません。**iPhone実機でのFilesピッカー、iCloudからの取得、実書籍、長時間利用のメモリ安定性は別途確認が必要です。**

調査資料: [PDF.js API](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html)、[PDF.js配布](https://mozilla.github.io/pdf.js/getting_started/)、[tsshogi仕様](https://github.com/sunfish-shogi/tsshogi)。PDF.jsと同梱フォント/CMap/WASMのライセンス、tsshogiのMITライセンスを配布物内に保持しています。
