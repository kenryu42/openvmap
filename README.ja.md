[![CI](https://github.com/kenryu42/openvmap/actions/workflows/ci.yml/badge.svg)](https://github.com/kenryu42/openvmap/actions/workflows/ci.yml)
[![Vendor sources](https://github.com/kenryu42/openvmap/actions/workflows/vendor-sources.yml/badge.svg)](https://github.com/kenryu42/openvmap/actions/workflows/vendor-sources.yml)
[![Code: MIT](https://img.shields.io/badge/code-MIT-red.svg)](LICENSE)
[![Data: CC BY 4.0](https://img.shields.io/badge/data-CC%20BY%204.0-lightgrey.svg)](data/LICENSE)

<div align="center">

[English](README.md) · **日本語**

<img src=".github/hero.svg" alt="OpenVMap: 自社サイトを動かしている事業者と、そのセキュリティ対応状況" width="100%">

</div>

自社サイトを動かしている事業者と、そのセキュリティ対応状況を1ページで確認する、無料のツールです。

ドメインを入力すると、次のことが分かります。

- サイトのサーバー、DNS、CDN、メール、証明書を担っている事業者
- それぞれの事業者がセキュリティ事故について発表した内容（出典へのリンク付き）
- 今やることと、制作会社・ホスティング事業者への問い合わせ文

サーバーの脆弱性を修正するのは、サーバーを管理している事業者です。外部からの「診断」は何も修正しません。

現在掲載中: php2shell（CVE-2026-109618 / CVE-2026-109619）。詳しくは[対応ガイド](content/guide/php2shell/ja.md)を読んでください。

## すること、しないこと

確認で行うのは次の3つだけです。

- 公開 DNS と Team Cymru の AS の問い合わせ（閲覧者のブラウザから Cloudflare の DNS over HTTPS で）
- トップページへの通常の GET 1回（Cloudflare Worker から）
- 証明書の発行元を読むための TLS 接続の開始1回

攻撃用のリクエスト、トップページ以外へのアクセス、非公開アドレスへの接続、LLM によるサイトの判定はしません。確認したドメインは保存しません。自分が管理するドメイン、または確認を依頼されたドメインに使ってください。

## 限界

サーバーが修正済みかどうかは外部からは分かりません。ホスティング事業者も Linux ディストリビューションも、バージョン番号を変えずに修正を適用するからです。このツールは「誰に聞くか」と「何を聞くか」を答えます。事業者の対応状況は各社の発表をもとにしているので、リンク先の出典を確認してください。

## 開発

[bun](https://bun.sh) と Node 22 以上が必要です。先に `.dev.vars` に `SALT=<任意の文字列>` を書いてください。

```
bun install
bun run dev     # http://localhost:3000（Worker も起動）
bun run check   # lint・型・テスト・ビルド
```

Cloudflare Workers（無料プラン）への公開:

```
bunx wrangler secret put SALT
bun run deploy
```

## 貢献

事業者の対応状況は [data/providers.yaml](data/providers.yaml)、ツールの一覧は [data/tools.yaml](data/tools.yaml) にあり、ルールは各ファイルの冒頭にあります。ASN を推測しない、公式発表以外は `secondary` と書く、必ず出典を付ける、の3点を守ってください。サイトで取り上げる事故は `providers.yaml` 冒頭の `incident:` で決まり、その対応ガイドは `content/guide/<incident>/` にあります。

## ライセンス

コード: MIT（[LICENSE](LICENSE)）。データ: CC BY 4.0（[data/LICENSE](data/LICENSE)）。
