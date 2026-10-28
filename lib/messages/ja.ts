import type { Confidence, Kind, Status } from "../provider";
import type { Verdict, VersionStatus } from "../phpsig";
import type { Cost, Runs } from "../tools";

export const ja = {
  lang: "ja" as const,

  title: "チェック結果",
  checkedAt: "確認日時:",
  secProviders: "このサイトを支えている事業者（公開DNS・経路情報・証明書から）",
  secPHP: "PHP の痕跡（トップページへの通常アクセス1回から）",
  secStatus: (incident: string) => `事業者の ${incident} 対応状況とセキュリティ事故（このツールに登録済みの情報）`,
  secActions: "今やること",
  secTemplate: "問い合わせテンプレート（制作会社・ホスティング事業者向け）",
  noHosts: "Webホストを解決できませんでした。",
  noAddress: "（アドレスなし）",
  noProviders: "登録済みの事業者に一致しませんでした。上の AS 名が事業者名です。",
  httpSkipped: "ページ取得は行っていません。",
  httpFailed: "ページ取得に失敗:",
  httpFrom: "取得元:",
  verdict: "判定:",
  versionShown: "PHPバージョン表示:",
  versionHidden: "なし（多くのサーバーは非表示。修正状況は外部からは確認できません）",
  customerAction: "利用者の対応:",
  source: "出典:",
  verified: "確認日",
  warnings: "確認できなかった項目:",
  disclaimer:
    "注意: このツールは公開DNS・経路情報、トップページ1回の通常アクセスと証明書の発行元しか見ていません。" +
    "PHPの修正状況は外部からは確認できません（事業者やLinuxディストリビューションはバージョン番号を変えずに修正を適用します）。" +
    "確実な答えは、サーバーを管理している事業者または担当者だけが持っています。",
  vendorPlaceholder: "ホスティング事業者",
  stale: (days: number) => `この情報は ${days} 日前に確認したものです。最新の状況は出典で確認してください。`,

  actNoHosts: "ドメインのWebホスト（A/AAAAレコード）を解決できませんでした。ドメイン名を確認してください。",
  actHostingUnlisted: (name: string, incident: string) =>
    `【${name}】がWebサーバーを運用しています。この事業者の ${incident} 対応状況はこのツールに未登録です。事業者の公式お知らせを確認するか、下のテンプレートで問い合わせてください。`,
  actPatched: (name: string, conf: string, date: string, action: string) => `【${name}】は対応完了を発表しています（${conf}、${date}）。${action}`,
  actInProgress: (name: string, action: string) =>
    `【${name}】は対応中です。完了の公式発表を確認するまで、IPAの案内に沿ってアクセス制限や一時的な公開停止を検討してください。${action}`,
  actUnknown: (name: string, action: string) => `【${name}】の対応状況は確認できていません。${action} 下のテンプレートで問い合わせてください。`,
  actSaas: (name: string, action: string) => `【${name}】がサイトを自社の基盤で運用しています。利用者がサーバーのPHPを管理する構成ではありません。${action}`,
  actPaas: (name: string) =>
    `【${name}】はアプリ実行基盤（PaaS）です。PHPを使う場合は、利用者（または制作会社）がコンテナのイメージやビルド設定でPHPのバージョンを管理します。制作会社に、PHPを使っているかと、修正版に更新して再デプロイしたかを確認してください。`,
  actCloud: (name: string) =>
    `【${name}】はIaaSです。PHPはあなた（または制作会社）が管理するサーバーで動いています。サーバー管理者にOSパッケージまたはPHPの更新を依頼してください。内部からの確認には Vuls などのパッケージ検査ツールが使えます。`,
  actCDN: (name: string) =>
    `Webは ${name}（CDN）経由で配信されています。実際にPHPを動かしているサーバーは外部から見えません。制作会社または担当者に、オリジンサーバーのホスティング先とPHPの更新状況を確認してください。`,
  actDistrustedRoot: (host: string, root: string) =>
    `警告: ${host} の証明書は「${root}」につながっています。このルート証明書は Firefox などで信頼されなくなっており、閲覧者のブラウザでエラーになります。至急、別の認証局の証明書に入れ替えてください。`,
  actCaIncident: (name: string, title: string, status: string, action: string) =>
    `このサイトの証明書は【${name}】の発行です。${name} は「${title}」を発表しています（${status}）。${action}`,
  actOtherIncident: (name: string, title: string, status: string, action: string) =>
    `【${name}】は「${title}」を発表しています（${status}）。このサイトや関連サービスを ${name} で動かしている場合: ${action}`,
  actUnmatched: (list: string) =>
    `Webサーバーのネットワークはこのツールのリストにありません: ${list}。この名称の事業者（またはサーバー管理者）に問い合わせてください。`,
  actHTTPFailed: (err: string) => `トップページを取得できなかったため、PHPの判定は行っていません（${err}）。`,
  actHTTPStatus: (status: number) =>
    `トップページは HTTP ${status} を返したため、PHPの判定は行っていません。CDNやファイアウォールのエラー応答は、サイトを動かしているサーバーの構成を表しません。`,
  actPHPLikely: (ev: string) => `トップページの応答からPHPの利用が強く示唆されます（${ev}）。このサイトは今回の脆弱性の対象です。`,
  actPHPPossible: (ev: string) => `トップページにPHPを使っている可能性を示す弱い根拠があります（${ev}）。制作会社に確認してください。`,
  actPHPUnlikely:
    "トップページは非PHP構成に見えます。ただし、管理画面・問い合わせフォーム・サブドメインでPHPを使っている場合があるので、制作会社に確認してください。",
  actPHPNone: "トップページからPHPの痕跡は見つかりませんでした。外部からは見えない場合があるため、制作会社に「PHPを使っているか」を確認してください。",
  actVersionFixed: (v: string) => `応答ヘッダのPHPバージョン ${v} は修正版以上です。`,
  actVersionBelow: (v: string, fixed: string) =>
    `応答ヘッダのPHPバージョン ${v} は修正版（${fixed}）より古い表示です。ただし事業者やディストリビューションはバージョン番号を変えずに修正を適用することがあるため、これだけでは未修正とは断定できません。事業者に確認してください。`,
  actVersionUnfixed: (v: string) =>
    `応答ヘッダのPHPバージョン ${v} には PHP 公式の修正版がありません。ホスティング事業者の独自修正の有無を確認し、サポート対象の 8.2 以上への移行を計画してください。古いPHPで作られたサイトは、移行にフレームワークやライブラリの更新と動作確認（テスト）が必要になり、時間がかかることがあります。制作会社に作業の範囲と期間を確認し、移行が終わるまでの間は、IPAの案内に沿ってアクセス制限や一時的な公開停止も検討してください。利用者を守るための公開停止は、正しい判断になり得ます。`,
  actLongCookie:
    "警告: 異常に長い PHPSESSID Cookie が返されました。JPCERT/CC は php2shell の侵害痕跡の一つとして挙げています。至急、サーバー管理者またはホスティング事業者に相談してください。",
  actOnlyFix:
    "修正方法は PHP を修正版（8.5.12 / 8.4.27 / 8.3.36 / 8.2.35）または事業者の修正済みビルドに更新することだけです。「AI脆弱性診断」などの外部診断サービスはサーバーのPHPを更新しません。見積もりが届いても、まず上の確認を済ませてください。",
  actRefs: (ipa: string, jpcert: string) => `参考: IPA 注意喚起 ${ipa} / JPCERT/CC 注意喚起 ${jpcert}`,

  template: (vendor: string, domain: string, ipa: string, jpcert: string) => `件名: PHPの脆弱性（CVE-2026-109618 / CVE-2026-109619）への対応状況のご確認

${vendor} ご担当者様

お世話になっております。
2026年10月21日に公開されたPHPの脆弱性（CVE-2026-109618、CVE-2026-109619、通称 php2shell）について、
弊社サイト（${domain}）に関する以下の点をご確認いただけますでしょうか。

1. 弊社サイトが稼働しているPHPのバージョン
2. 修正版（8.5.12 / 8.4.27 / 8.3.36 / 8.2.35）または同等の修正パッチの適用状況。
   未適用の場合は、適用予定日時
3. PHP 8.1 以前で稼働している場合、サポート対象バージョンへの移行の要否・手順・費用
4. 10月17日以降の不審なアクセスや侵害の痕跡の有無
   （JPCERT/CC は、異常に長い PHPSESSID Cookie などを確認観点として挙げています）
5. 更新作業を実際に担当する会社（再委託先を含めて）と、弊社側の窓口
6. 更新が終わるまでの間の対策（アクセス制限や一時的な公開停止など）の要否

参考:
- IPA 注意喚起: ${ipa}
- JPCERT/CC 注意喚起: ${jpcert}

お手数をおかけしますが、よろしくお願いいたします。`,

  ui: {
    nav: { home: "チェック", providers: "事業者の対応状況", guide: "対応ガイド", tools: "ツール", about: "このツールについて" },
    menu: "メニュー",
    skip: "本文へ移動",
    privacy: "プライバシー",
    terms: "利用条件",
    switchLang: "English",
    nowCovering: (incident: string) => `いま確認すべき脆弱性: ${incident}`,
    incidentLabel: (name: string, cves: string[]) => (cves.length > 0 ? `${name}（${cves.join(" / ")}）` : name),
    home: {
      titleLines: ["自社サイトを動かしている事業者と、", "そのセキュリティ対応状況を確認する"],
      sub: "ドメインを入力すると、Web・DNS・メール・証明書を担う事業者を公開情報から割り出し、各社が発表したセキュリティ対応状況と、次に誰に何を聞けばよいかを表示します。",
      reassure: ["非営利・登録不要", "ドメインは読める形で保存しません", "サイトへのアクセスはトップページ1回"],
      proof: (n: number, official: number, date: string) => `${n}社の対応状況を掲載 · うち公式発表に基づく記載 ${official}件 · ${date} 更新`,
      problemEyebrow: "なぜ必要か",
      problemTitle: "修正するのは、サーバーを管理している会社です",
      problemBody:
        "サーバーのソフトウェアの脆弱性は、サイトの持ち主ではなく、サーバーを管理している事業者が修正します。ところが、自社サイトがどの会社のサーバーで動いているのかは、制作会社に任せたままで分からないことがよくあります。",
      solutionBody: "OpenVMap は公開DNS・経路情報・証明書から事業者を特定し、その会社が何を発表しているかを並べて見せます。",
      tagline: [
        ["まず、", "聞く相手を", "知る。"],
        ["修正は、", "そこから", "始まります。"],
      ],
      benefitsEyebrow: "分かること",
      benefitsTitle: "結果のページで分かること",
      benefits: (n: number, others: string, incident: string) => [
        {
          title: "どの会社に聞けばいいか",
          body: "Web・DNS・メール・証明書のそれぞれについて、担っている事業者を表示します。制作会社に任せきりのサイトでも分かります。",
        },
        { title: "各社の発表を1か所で", body: `${n}社の ${incident} 対応状況を、公式発表へのリンクと確認日を付けて掲載しています。` },
        { title: "事業者自身の事故", body: `${others} の発表した事故も、該当する事業者を使っているときに表示します。` },
        { title: "そのまま送れる問い合わせ文", body: "結果に合わせて、制作会社やホスティング事業者に送る質問を作ります。コピーして送るだけです。" },
        { title: "相手のサイトに負担をかけない", body: "サイトへのアクセスは、トップページへの通常の閲覧1回と、証明書を読むための接続の開始1回だけです。" },
      ],
      stepsEyebrow: "使い方",
      stepsTitle: "3つの手順で、次の一手まで",
      howSteps: [
        { title: "ドメインを入力", body: "自社サイトのドメインを入れて「調べる」を押します。" },
        { title: "公開情報から事業者を特定", body: "公開DNSと経路情報を調べ、トップページの応答と証明書から基盤と認証局を読み取ります。" },
        { title: "対応状況と次の一手を表示", body: "各事業者の発表、今やること、問い合わせ文をまとめて表示します。" },
      ],
      sourcesEyebrow: "情報の出どころ",
      sourcesTitle: "出典をたどれる情報だけを載せています",
      sourcesBody:
        "各社の対応状況は、事業者の発表をもとに記載しています。誤りがありうるため、すべてに確認日を付け、出典にリンクしています。サイトの判定に生成AIは使っていません。",
      statProviders: "掲載している事業者",
      statOfficial: "公式発表に基づく記載",
      statUpdated: "最終更新",
      seeProviders: "事業者の対応状況を見る",
      openSource: "ソースコードとデータは GitHub で公開しています（MIT / CC BY 4.0）",
      faqEyebrow: "よくある質問",
      faqTitle: "使う前に気になること",
      faq: [
        {
          q: "料金はかかりますか",
          a: "かかりません。個人が運営する無料・非営利のツールで、登録も不要です。相談窓口や有料サービスへの案内、こちらからの営業連絡もありません。",
        },
        {
          q: "入力したドメインは保存されますか",
          a: "読める形では保存しません。同じサイトへのアクセスが集中しないよう PHP の確認結果を1時間だけ保存しますが、目印にはドメイン名を復元できない値を使います。サーバーのアクセスログも記録していません。",
        },
        {
          q: "調べたサイトに負担や迷惑をかけませんか",
          a: "サイトへのアクセスは、トップページへの通常の GET 1回と、証明書の発行元を読むための TLS 接続の開始1回だけです。攻撃、ログイン試行、ディレクトリ探索、ポートスキャンは行いません。",
        },
        {
          q: "PHP が修正済みかどうかまで分かりますか",
          a: "分かりません。修正状況は外部からは見えないためです。結果は「誰に、何を聞くか」を決めるためのもので、最終的な確認はサーバーを管理している事業者や制作会社に行ってください。",
        },
        {
          q: "どのドメインを調べてもよいですか",
          a: "自分が管理するドメイン、または確認を依頼されたドメインに対して使ってください。結果のページは検索エンジンに登録されません。",
        },
        {
          q: "事業者の対応状況はどこから来ていますか",
          a: "事業者が公開した発表をもとに記載しています。誤りがありうるため、必ず出典で確認してください。「公式発表」は事業者自身のページ、「二次情報」は報道や第三者のまとめに基づくもので、どちらにも確認日と出典を付けています。",
        },
        {
          q: "「不明」と表示されたら、対応していないということですか",
          a: "いいえ。公式の発表を確認できていないという意味です。問い合わせ文を使って、事業者に直接確認してください。",
        },
        {
          q: "サイトの判定に生成AIを使っていますか",
          a: "使っていません。すべての結論は、公開DNS・経路情報・トップページの応答・証明書という記録された観測から再現できます。",
        },
        { q: "誰が運営していますか", a: "個人が運営しています。ソースコードと事業者のデータは GitHub で公開しており、誤りの報告もそちらで受け付けています。" },
      ],
      finalTitle: "自社サイトの事業者を、いま確認する",
      finalBody: "非営利・登録不要。入力したドメインは読める形では保存しません。",
    },
    inputLabel: "ドメイン",
    inputPlaceholder: "example.co.jp",
    submit: "調べる",
    ownDomains: "自分が管理するドメイン、または確認を依頼されたドメインに対して使ってください。",
    readGuide: "対応ガイドを読む",
    checking: "確認中です（公開DNSと経路情報の参照）…",
    invalid: (input: string) => `「${input}」はドメイン名として読めませんでした。example.co.jp の形で入力してください。`,
    noDomain: "確認するドメインが指定されていません。",
    phpChecking: "トップページへの通常アクセス1回で、PHP の痕跡を確認しています…",
    phpLimited: "短時間に多くの確認が行われたため、PHP の確認を一時的に止めています。1分ほどしてからもう一度お試しください。",
    phpUnavailable: "PHP の確認を実行できませんでした。時間をおいてもう一度お試しください。",
    phpCachedNote: (min: number) => `${min} 分前に確認した結果です。同じサイトへのアクセスを減らすため、PHP の確認結果は1時間保存しています。`,
    copyJson: "JSON をコピー",
    colRole: "種類",
    colHost: "ホスト",
    colAddress: "アドレス・CNAME",
    colNetwork: "ネットワーク（AS）",
    colProvider: "事業者",
    roleLabels: { web: "Web", cname: "Web（CNAME）", http: "Web（応答ヘッダ）", ns: "DNS", mx: "メール", tls: "TLS証明書" },
    checksTitle: "確認した項目",
    checkFound: (name: string) => `該当: このサイトは${name}を使っています`,
    checkClear: "このサイトでは見つかりませんでした",
    checkClearIssuer: (issuer: string) => `このサイトでは見つかりませんでした（証明書の発行元: ${issuer}）`,
    checkPending: "確認中…",
    checkFailed: "確認できませんでした",
    checkMissing: {
      page: "未確認: トップページの応答を得られず、応答ヘッダで判別できませんでした",
      cert: "未確認: 証明書を取得できませんでした",
    },
    checksNote:
      "「見つかりませんでした」は、公開DNS・経路情報・トップページの応答ヘッダ・証明書のどれにも、その事業者を使っている形跡がなかったという意味です。",
    otherIncidents: "事業者自身のセキュリティ事故",
    copy: "コピー",
    copied: "コピーしました",
    detail: "詳細",
    providersTitle: "事業者のセキュリティ対応状況",
    providersIntro: "各事業者の公式発表（公式）と、報道・まとめ記事（二次情報）をもとにまとめたものです。誤りがありうるため、必ず出典を確認してください。",
    colName: "事業者",
    colKind: "種別",
    colStatus: (incident: string) => `${incident} 対応状況`,
    colConfidence: "確度",
    colDate: "日付",
    colSource: "出典",
    updated: "最終更新:",
    link: "リンク",
    vendorTitle: (name: string) => `${name}のセキュリティ対応状況`,
    summary: "概要",
    identifiers: "このツールが事業者を見分ける手がかり",
    asns: "AS番号",
    nsSuffixes: "ネームサーバー",
    cnameSuffixes: "CNAME",
    mxSuffixes: "メールサーバー",
    httpHeaders: "応答ヘッダ（名前）",
    certIssuers: "証明書の発行元（O）に含まれる文字列",
    distrustedRoots: "ブラウザが信頼しなくなったルート証明書",
    asNames: "AS名に含まれる文字列",
    noIncident: "この事業者は利用者のサーバーで PHP を動かしていないため、対応状況の登録はありません。",
    correction: "訂正を報告する（GitHub）",
    verifiedOn: "確認日:",
    notFound: "見つかりませんでした。",
    tagline: "個人が運営する無料・非営利のツール。入力したドメインは読める形では保存しません。",
    mapCaption: "1つのドメインの裏にいる事業者",
    steps: ["公開DNS", "経路（AS）", "トップページ", "証明書"],
    exampleDomain: "example.co.jp",
  },

  tools: {
    title: "小さなチームのための無料のセキュリティツール",
    eyebrow: "オープンソース",
    intro:
      "セキュリティ担当者がいない会社のエンジニア向けに、やりたいことごとに1つずつ選んだオープンソースのツールです。どれもオープンソースのライセンスで、無料で使えます。有料版がある場合はそう書いています。各ツールの最終コミット・最新リリース・ライセンス・GitHub のスター数・OpenSSF Scorecard の点数は毎日確認しています。スター数は広く使われているかの目安で、安全の保証ではありません。Scorecard の点数は、そのプロジェクトが自分のコードとリリースをどう守っているかの評価です。",
    jobs: "やりたいこと",
    pick: "おすすめ",
    alternative: "ほかの選択肢",
    byAuthor: "このサイトの作者が作ったツール",
    tryIt: "試す",
    license: "ライセンス",
    lastCommit: "最終コミット",
    latestRelease: "最新リリース",
    stars: "GitHub のスター",
    scorecard: "OpenSSF Scorecard",
    scorecardOf: (score: number, date: string) => `${score} / 10 · ${date}`,
    notScored: "未評価",
    incident: "セキュリティ事故",
    advisory: "公式の発表",
    archived: "作者によってアーカイブ済みです。今後の修正は出ません。",
    quiet: (days: number) => `${days}日以上コミットがありません。保守が続いているか確認してください。`,
    suggest: "追加や訂正を提案する（data/tools.yaml）",
    checked: "GitHub での確認日",
  },
  costLabels: { free: "無料", "open-core": "無料版あり（有料版も提供）" } satisfies Record<Cost, string>,
  runsLabels: { cli: "コマンド", ci: "CI・ボット", service: "常駐サービス", rules: "ルール集" } satisfies Record<Runs, string>,
  statusLabels: {
    patched: "対応完了",
    in_progress: "対応中",
    unknown: "不明",
    conflicting: "情報が一致せず",
    "n/a": "利用者管理",
  } satisfies Record<Status, string>,
  confLabels: { official: "公式発表", secondary: "二次情報", "": "出典なし" } satisfies Record<Confidence, string>,
  kindLabels: {
    hosting: "ホスティング",
    saas: "サイト運営サービス",
    paas: "アプリ実行基盤（PaaS）",
    ca: "証明書の発行元（認証局）",
    cloud: "クラウド（IaaS）",
    cdn: "CDN（オリジンを隠す）",
    dns: "DNSのみ",
    mail: "メールのみ",
  } satisfies Record<Kind, string>,
  verdictLabels: {
    likely: "PHPを使っている可能性が高い",
    possible: "PHPを使っている可能性あり",
    unlikely: "非PHP構成に見える",
    none: "痕跡なし",
  } satisfies Record<Verdict, string>,
  versionLabels: {
    fixed_or_later: "修正版以上",
    below_fixed_release: "修正版より古い表示。事業者のバックポートの可能性あり",
    no_official_fix: "PHP公式の修正版なし",
    unknown: "判定不能",
  } satisfies Record<VersionStatus, string>,
};

export type Messages = Omit<typeof ja, "lang"> & { lang: "ja" | "en" };
