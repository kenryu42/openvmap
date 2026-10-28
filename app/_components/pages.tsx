import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { Arrow } from "./check";
import { StaleNotice } from "./client";
import { linkClass, Site, statusColor, StatusBadge } from "./site";
import { incidentOf, otherIncidents, type Incident, type Provider, type Status } from "@/lib/provider";
import { base, messages, otherLang, type Lang } from "@/lib/lang";
import { pick } from "@/lib/report";
import { dohService } from "@/lib/doh";
import { repoUrl } from "@/lib/meta";
import { table } from "@/lib/table";

const th = "border-b border-rule-strong px-3 py-2.5 text-left text-xs font-medium whitespace-nowrap text-muted";
const td = "border-b border-rule px-3 py-3.5 align-top";
const statusOrder: Status[] = ["patched", "in_progress", "conflicting", "unknown", "n/a"];

export function PageHead({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <header className="rise mb-12">
      <p className="font-mono text-xs tracking-[0.18em] text-accent uppercase">{eyebrow}</p>
      <h1 className="mt-3 text-[clamp(2rem,3.6vw+1rem,3.5rem)] leading-[1.15] font-bold tracking-tight">{title}</h1>
      {children}
    </header>
  );
}

export function ProvidersPage({ lang }: { lang: Lang }) {
  const m = messages(lang);
  const s = m.ui;
  const p = base(lang);
  const counts = new Map<Status, number>();
  for (const pr of table.providers) {
    const inc = incidentOf(pr, table.incident);
    if (inc) counts.set(inc.status, (counts.get(inc.status) ?? 0) + 1);
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  return (
    <Site lang={lang} alt={`${base(otherLang(lang))}/providers`} incident={table.incident} wide>
      <PageHead eyebrow={s.incidentLabel(table.incident, table.incident_cves)} title={s.providersTitle}>
        <p className="mt-4 max-w-2xl leading-8 text-muted">{s.providersIntro}</p>
      </PageHead>

      {total > 0 && (
        <section className="rise mb-12 rounded-2xl border border-rule bg-surface p-5 sm:p-6" style={{ "--i": 1 } as CSSProperties}>
          <div
            className="flex h-3 gap-0.5 overflow-hidden rounded-full"
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- <img> cannot hold the bar's segments
            role="img"
            aria-label={statusOrder
              .filter((st) => counts.get(st))
              .map((st) => `${m.statusLabels[st]} ${counts.get(st)}`)
              .join(", ")}
          >
            {statusOrder
              .filter((st) => counts.get(st))
              .map((st, i) => (
                <span
                  key={st}
                  className="h-full origin-left animate-[grow-x_1.1s_var(--ease-out-expo)_both]"
                  style={{ flexGrow: counts.get(st), background: statusColor[st], animationDelay: `${i * 80}ms` }}
                />
              ))}
          </div>
          <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {statusOrder
              .filter((st) => counts.get(st))
              .map((st) => (
                <li key={st} className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ background: statusColor[st] }} />
                  {m.statusLabels[st]}
                  <span className="font-mono text-muted tabular-nums">{counts.get(st)}</span>
                </li>
              ))}
          </ul>
        </section>
      )}

      <div className="reveal -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="w-full border-collapse text-sm sm:min-w-[40rem]">
          <thead>
            <tr>
              <th className={th}>{s.colName}</th>
              <th className={`${th} hidden sm:table-cell`}>{s.colKind}</th>
              <th className={th}>{s.colStatus(table.incident)}</th>
              <th className={`${th} hidden sm:table-cell`}>{s.colConfidence}</th>
              <th className={`${th} hidden sm:table-cell`}>{s.colDate}</th>
              <th className={th}>{s.colSource}</th>
            </tr>
          </thead>
          <tbody>
            {table.providers.map((pr) => {
              const inc = incidentOf(pr, table.incident);
              const name = pick(lang === "ja", pr.name_ja, pr.name);
              return (
                <tr key={pr.id} className="group transition-colors hover:bg-surface">
                  <td className={td}>
                    <Link href={`${p}/providers/${pr.id}`} className="inline-flex items-center gap-1.5 font-semibold transition-colors group-hover:text-accent">
                      {name}
                      <Arrow className="size-3.5 -translate-x-1 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100" />
                    </Link>
                    <span className="mt-1 block text-xs text-muted sm:hidden">
                      {[m.kindLabels[pr.kind], inc && m.confLabels[inc.confidence], inc?.date].filter(Boolean).join(" · ")}
                    </span>
                  </td>
                  <td className={`${td} hidden text-muted sm:table-cell`}>{m.kindLabels[pr.kind]}</td>
                  <td className={td}>{inc ? <StatusBadge status={inc.status} lang={lang} /> : <span className="text-faint">—</span>}</td>
                  <td className={`${td} hidden text-muted sm:table-cell`}>{inc ? m.confLabels[inc.confidence] : ""}</td>
                  <td className={`${td} hidden font-mono text-[13px] whitespace-nowrap text-muted tabular-nums sm:table-cell`}>{inc?.date ?? ""}</td>
                  <td className={`${td} whitespace-nowrap`}>
                    {inc?.source && (
                      <a href={inc.source} className={linkClass} rel="noopener noreferrer">
                        <span className="sr-only">{name} </span>
                        {s.link}
                      </a>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted">
        <span>
          {s.updated} <span className="font-mono">{table.updated_at}</span>
        </span>
        <a href={`${repoUrl}/blob/main/data/providers.yaml`} className={linkClass}>
          {s.correction}
        </a>
      </div>
    </Site>
  );
}

function providerTitle(pr: Provider, lang: Lang): string {
  return messages(lang).ui.vendorTitle(pick(lang === "ja", pr.name_ja, pr.name));
}

export function providerParams(): { id: string }[] {
  return table.providers.map((pr) => ({ id: pr.id }));
}

export async function providerMetadata(params: Promise<{ id: string }>, lang: Lang): Promise<Metadata> {
  const pr = table.get((await params).id);
  return pr ? { title: providerTitle(pr, lang) } : {};
}

export async function ProviderRoute({ params, lang }: { params: Promise<{ id: string }>; lang: Lang }) {
  const pr = table.get((await params).id);
  if (!pr) notFound();
  return <ProviderPage provider={pr} lang={lang} />;
}

function ProviderPage({ provider: pr, lang }: { provider: Provider; lang: Lang }) {
  const m = messages(lang);
  const s = m.ui;
  const ja = lang === "ja";
  const inc = incidentOf(pr, table.incident);
  const ids: [string, string[]][] = [
    [s.asns, pr.asns.map((a) => `AS${a}`)],
    [s.asNames, pr.as_name_contains],
    [s.nsSuffixes, [...pr.ns_suffixes.map((x) => `*.${x}`), ...pr.ns_contains.map((x) => `*${x}*`)]],
    [s.cnameSuffixes, pr.cname_suffixes.map((x) => `*.${x}`)],
    [s.mxSuffixes, pr.mx_suffixes.map((x) => `*.${x}`)],
    [s.httpHeaders, pr.http_headers],
    [s.certIssuers, pr.cert_issuers],
    [s.distrustedRoots, pr.distrusted_roots],
  ];
  const notes = pick(ja, pr.notes_ja, pr.notes);
  return (
    <Site lang={lang} alt={`${base(otherLang(lang))}/providers/${pr.id}`} incident={table.incident}>
      <Link href={`${base(lang)}/providers`} className="group mb-8 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink">
        <Arrow className="size-4 rotate-180 transition-transform duration-300 group-hover:-translate-x-1" />
        {s.nav.providers}
      </Link>
      <PageHead eyebrow={m.kindLabels[pr.kind]} title={providerTitle(pr, lang)}>
        {inc && (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <StatusBadge status={inc.status} lang={lang} />
            <span className="text-sm text-muted">
              {m.confLabels[inc.confidence]}
              {inc.date && <span className="font-mono"> · {inc.date}</span>}
            </span>
          </div>
        )}
      </PageHead>

      {inc ? (
        <section className="rise relative overflow-hidden rounded-2xl border border-rule bg-surface p-6 sm:p-8" style={{ "--i": 1 } as CSSProperties}>
          <IncidentBody inc={inc} lang={lang} />
        </section>
      ) : (
        <p className="rounded-2xl border border-rule bg-surface p-6 leading-8 text-muted">{s.noIncident}</p>
      )}
      {notes && <p className="mt-8 max-w-3xl leading-8">{notes}</p>}

      {otherIncidents(pr, table.incident).map((i) => (
        <section key={i.key} className="reveal relative mt-10 overflow-hidden rounded-2xl border border-[var(--bad)]/30 bg-[var(--bad-soft)]/40 p-6 sm:p-8">
          <p className="font-mono text-[11px] tracking-wide text-[var(--bad)] uppercase">{s.otherIncidents}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-bold">{pick(ja, i.title, i.title_en)}</h2>
            <StatusBadge status={i.status} lang={lang} />
            <span className="text-sm text-muted">
              {m.confLabels[i.confidence]}
              {i.date && <span className="font-mono"> · {i.date}</span>}
            </span>
          </div>
          <div className="mt-4">
            <IncidentBody inc={i} lang={lang} />
          </div>
        </section>
      ))}

      <section className="reveal mt-14">
        <h2 className="mb-4 border-t border-rule pt-5 text-lg font-bold">{s.identifiers}</h2>
        <dl className="grid gap-px overflow-hidden rounded-2xl border border-rule bg-rule text-sm sm:grid-cols-[minmax(10rem,auto)_1fr]">
          {ids
            .filter(([, v]) => v.length > 0)
            .map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="bg-surface px-4 pt-3 text-xs text-muted sm:py-3">{k}</dt>
                <dd className="flex flex-wrap gap-1.5 bg-surface px-4 pb-3 sm:py-3">
                  {v.map((x) => (
                    <code key={x} className="rounded-md bg-sunken px-2 py-0.5 font-mono text-[12px] break-all">
                      {x}
                    </code>
                  ))}
                </dd>
              </div>
            ))}
        </dl>
      </section>
      <p className="mt-8 text-xs">
        <a href={`${repoUrl}/blob/main/data/providers.yaml`} className={linkClass}>
          {s.correction}
        </a>
      </p>
    </Site>
  );
}

function IncidentBody({ inc, lang }: { inc: Incident; lang: Lang }) {
  const m = messages(lang);
  const s = m.ui;
  const ja = lang === "ja";
  return (
    <div className="space-y-5 leading-8">
      <div>
        <h3 className="text-xs font-semibold text-muted">{s.summary}</h3>
        <p className="mt-1">{pick(ja, inc.summary, inc.summary_en)}</p>
      </div>
      <div className="rounded-xl bg-sunken p-4 sm:p-5">
        <h3 className="text-xs font-semibold text-muted">{m.customerAction}</h3>
        <p className="mt-1">{pick(ja, inc.customer_action, inc.customer_action_en)}</p>
      </div>
      <p className="text-xs leading-6 text-muted">
        {inc.source && (
          <>
            {m.source}{" "}
            <a href={inc.source} className={`${linkClass} break-all`} rel="noopener noreferrer">
              {inc.source}
            </a>
            <br />
          </>
        )}
        {s.verifiedOn} <span className="font-mono">{inc.verified_at}</span>
      </p>
      <StaleNotice verifiedAt={inc.verified_at} lang={lang} />
    </div>
  );
}

const browserRecipients = [
  {
    ...dohService,
    sent: {
      ja: "確認するドメインと、その確認に必要なホスト名・IPアドレスの DNS 問い合わせ。通信のため、閲覧者の IP アドレスも相手に届きます。",
      en: "DNS lookups for the domain being checked and the host names and addresses the check needs. Your IP address reaches them too, as with any connection.",
    },
    purpose: { ja: "公開DNSと経路情報の参照", en: "public DNS and routing lookups" },
    policyName: { ja: "Cloudflare の公開DNSのプライバシーポリシー", en: "Cloudflare's public DNS resolver privacy policy" },
  },
];

export function AboutPage({ lang }: { lang: Lang }) {
  const ja = lang === "ja";
  return (
    <Site lang={lang} alt={`${base(otherLang(lang))}/about`} incident={table.incident}>
      {ja ? (
        <div className="prose rise mx-auto">
          <h1>このツールについて</h1>
          <h2>このツールが送るリクエスト</h2>
          <p>ドメインを1つ確認するたびに、次のことだけを行います。</p>
          <ul>
            <li>
              公開DNSへの問い合わせ（A/AAAA、CNAME、NS、MX）と、IPアドレスからネットワークの運用者（AS）を調べる Team Cymru への DNS 問い合わせ。
              閲覧者のブラウザから Cloudflare の DNS over HTTPS（<code>{dohService.host}</code>）に送られ、対象サイトには届きません。
            </li>
            <li>
              トップページ（<code>/</code>）への通常の GET リクエスト。このサイトのサーバー（Cloudflare Workers）から送ります。https、www、http
              の順に試し、最初に応答したもので止めます。リダイレクトはたどりますが、合計8回まで、15秒までです。応答から PHP の痕跡と、 Railway・Zeabur・Vercel
              などの基盤が付ける応答ヘッダの名前（値は使いません）を確認します。
            </li>
            <li>
              サイトの443番ポートへの TLS 1.2 接続の開始1回。サーバーが最初に送る証明書から発行元（認証局）の名前を読み、そこで接続を切ります。
              暗号の鍵交換もページの要求もしません。このサイトのサーバー（Cloudflare Workers）から、確認済みの公開IPアドレスへ送ります。
            </li>
          </ul>
          <p>
            トップページ以外の URL には一切アクセスしません。攻撃用のリクエスト、ログイン試行、ディレクトリ探索、ポートスキャンは行いません。 リクエストの
            User-Agent は <code>OpenVMap/バージョン</code> で、このページへのリンクを含みます。
          </p>
          <p>サイトの判定にLLM（生成AI）は使っていません。すべての結論は記録された観測から再現できます。</p>
          <h2 id="privacy">保存するもの</h2>
          <p>
            確認したドメインの一覧は保存しません。結果のページではドメインを URL の <code>#</code> 以降（ブラウザがサーバーに送らない部分）に置き、 サーバーには
            PHP の確認のときだけ、URL ではなく本文で送ります。サーバーのアクセスログは記録していません。
          </p>
          <p>
            同じサイトへのアクセスが集中しないよう、PHP
            の確認結果を1時間だけ保存します。保存の目印はドメイン名を復元できない値（秘密の値を加えたハッシュ）です。 アクセス元の制限（1分10回）にも
            IPアドレスから作った同様の値を使い、アドレスそのものは保存しません。
          </p>
          <h2>外部への情報送信</h2>
          <p>確認のため、閲覧者のブラウザから次の送信を行います。広告、アクセス解析、SNS のための送信はなく、Cookie も使いません。</p>
          {browserRecipients.map((r) => (
            <ul key={r.host}>
              <li>
                送信先: {r.company}（<code>{r.host}</code>）
              </li>
              <li>送信する情報: {r.sent.ja}</li>
              <li>目的: {r.purpose.ja}</li>
              <li>
                取り扱い:{" "}
                <a href={r.privacyPolicy} className={linkClass}>
                  {r.policyName.ja}
                </a>
                に従います。
              </li>
            </ul>
          ))}
          <p>このサイト自体も Cloudflare 上で動いており、ページの表示と PHP の確認の通信は Cloudflare を経由します。</p>
          <h2>使ってよいドメイン</h2>
          <p>自分が管理するドメイン、または確認を依頼されたドメインに対して使ってください。結果のページは検索エンジンに登録されません。</p>
          <h2>事業者の対応状況の表示について</h2>
          <p>
            各事業者の対応状況は、事業者が公開した発表をもとに記載しています。誤りがありうるため、必ず出典で確認してください。「公式発表」は事業者自身のページ、「二次情報」は報道や第三者のまとめに基づくものです。
            「不明」は公式発表を確認できていないという意味で、対応していないという意味ではありません。どの表示にも確認した日付を付け、出典があるものはリンクしています。
          </p>
          <p>事業者の方で、記載の誤りや新しい発表があればお知らせください。確認のうえ、速やかに修正します。</p>
          <h2>サイトの管理者の方へ</h2>
          <p>
            このツールからのアクセスは、利用者が入力したドメインのトップページへの通常の閲覧1回です。ご質問や除外のご依頼は GitHub の Issue でお知らせください。
          </p>
          <h2 id="terms">利用条件と免責</h2>
          <ul>
            <li>このツールは無料で、個人が運営しています。</li>
            <li>
              結果は公開情報とトップページ1回の応答からの推定です。PHP
              の修正状況は外部からは分かりません。最終的な判断は、サーバーを管理している事業者や制作会社に確認してください。
            </li>
            <li>結果や掲載情報の正確さ・完全さは保証しません。法令で認められる範囲で、このツールの利用によって生じた損害について運営者は責任を負いません。</li>
            <li>事前の通知なく、内容の変更やサービスの停止をすることがあります。</li>
          </ul>
          <h2>ソースコードとライセンス</h2>
          <p>
            ソースコードは{" "}
            <a href={repoUrl} className={linkClass}>
              GitHub
            </a>{" "}
            で公開しています。コードは MIT ライセンス、事業者の対応状況のデータ（<code>data/providers.yaml</code>）は CC BY 4.0 です。
          </p>
          <h2>連絡先</h2>
          <p>
            <a href={`${repoUrl}/issues`} className={linkClass}>
              {repoUrl}/issues
            </a>
          </p>
        </div>
      ) : (
        <div className="prose rise mx-auto">
          <h1>About this tool</h1>
          <h2>The requests it makes</h2>
          <p>For each domain checked, it does only this:</p>
          <ul>
            <li>
              Public DNS lookups (A/AAAA, CNAME, NS, MX), and DNS lookups at Team Cymru to find the network operator (AS) of each address. Your browser sends
              them to Cloudflare&apos;s DNS over HTTPS (<code>{dohService.host}</code>); they never reach the site.
            </li>
            <li>
              One ordinary GET of the front page (<code>/</code>), sent from this site&apos;s server (Cloudflare Workers), trying https, www and http in that
              order and stopping at the first that answers. Redirects are followed, at most 8 requests and 15 seconds in total. The answer is checked for signs
              of PHP and for the names (not values) of headers that platforms such as Railway, Zeabur and Vercel add.
            </li>
            <li>
              The start of one TLS 1.2 connection to the site&apos;s port 443, sent from this site&apos;s server (Cloudflare Workers) to an address already
              checked to be public. It reads the name of the certificate authority from the certificate the server sends first, then closes the connection: no
              key exchange and no page request.
            </li>
          </ul>
          <p>
            It never requests any other URL, and sends no attack requests, login attempts, directory scans or port scans. The User-Agent is{" "}
            <code>OpenVMap/version</code> with a link to this page.
          </p>
          <p>No LLM is used to check a site. Every conclusion can be reproduced from the recorded observations.</p>
          <h2 id="privacy">What it stores</h2>
          <p>
            It keeps no list of checked domains. On the result page the domain sits after the <code>#</code> in the URL, the part browsers never send to a
            server, and it reaches the server only for the PHP check, in the request body rather than the URL. The server keeps no request logs.
          </p>
          <p>
            To stop many requests reaching one site, PHP check results are kept for one hour, under a value the domain cannot be recovered from (a hash with a
            secret added). The rate limit (10 a minute) uses the same kind of value made from the client address; the address itself is not stored.
          </p>
          <h2>Information sent to third parties</h2>
          <p>To run a check, your browser sends the following. Nothing is sent for ads, analytics or social media, and no cookies are set.</p>
          {browserRecipients.map((r) => (
            <ul key={r.host}>
              <li>
                Recipient: {r.company} (<code>{r.host}</code>)
              </li>
              <li>What is sent: {r.sent.en}</li>
              <li>Purpose: {r.purpose.en}</li>
              <li>
                Handling: under{" "}
                <a href={r.privacyPolicy} className={linkClass}>
                  {r.policyName.en}
                </a>
                .
              </li>
            </ul>
          ))}
          <p>This site itself runs on Cloudflare, so page views and the PHP check pass through Cloudflare.</p>
          <h2>Which domains to check</h2>
          <p>Use it on domains you manage or were asked to check. Result pages are not indexed by search engines.</p>
          <h2>About the provider statuses</h2>
          <p>
            Each provider&apos;s status is written from what the provider has published. It can be wrong, so always check the source. &ldquo;Official
            notice&rdquo; means the provider&apos;s own page; &ldquo;secondary source&rdquo; means press or third-party summaries. &ldquo;Unknown&rdquo; means
            no official notice could be found, not that the provider has done nothing. Every status shows the date it was checked, and links its source where
            there is one.
          </p>
          <p>Providers: if something is wrong or you have published an update, please tell us and we will correct it promptly.</p>
          <h2>For site administrators</h2>
          <p>
            A request from this tool is one ordinary visit to the front page of a domain a user typed in. Questions or exclusion requests: open an issue on
            GitHub.
          </p>
          <h2 id="terms">Terms and disclaimer</h2>
          <ul>
            <li>This tool is free and run by an individual.</li>
            <li>
              Results are estimates from public data and one response from the front page. PHP&apos;s patch state cannot be seen from outside; confirm with
              whoever runs your server or your web agency.
            </li>
            <li>
              No guarantee is made that results or listed information are accurate or complete. To the extent permitted by law, the operator is not liable for
              any loss arising from use of this tool.
            </li>
            <li>The content may change and the service may stop without notice.</li>
          </ul>
          <h2>Source code and license</h2>
          <p>
            The source code is on{" "}
            <a href={repoUrl} className={linkClass}>
              GitHub
            </a>
            . The code is MIT licensed; the provider status data (<code>data/providers.yaml</code>) is CC BY 4.0.
          </p>
          <h2>Contact</h2>
          <p>
            <a href={`${repoUrl}/issues`} className={linkClass}>
              {repoUrl}/issues
            </a>
          </p>
        </div>
      )}
    </Site>
  );
}
