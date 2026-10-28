import type { Messages } from "./ja";
import { phpAdvisory } from "../meta";

export const en: Messages = {
  lang: "en",

  title: "Check result",
  checkedAt: "Checked at:",
  secProviders: "Providers behind this site (from public DNS, routing data and the certificate)",
  secPHP: "PHP signals (from one ordinary request to the front page)",
  secStatus: (incident: string) => `Provider ${incident} status and security incidents (as recorded in this tool)`,
  secActions: "What to do now",
  secTemplate: "Message template (for your web agency or hosting provider)",
  noHosts: "No web host could be resolved.",
  noAddress: "(no address)",
  noProviders: "No listed provider matched. The AS name above identifies the network.",
  httpSkipped: "Page request skipped.",
  httpFailed: "Page request failed:",
  httpFrom: "Fetched:",
  verdict: "Verdict:",
  versionShown: "PHP version shown:",
  versionHidden: "none (most servers hide it; patch state is not visible from outside)",
  customerAction: "Customer action:",
  source: "Source:",
  verified: "verified",
  warnings: "Could not check:",
  disclaimer:
    "Note: this tool only looks at public DNS, routing data, one ordinary request to the front page and the issuer of its certificate. " +
    "The patch state of PHP is not visible from outside (providers and Linux distributions apply fixes without changing the version string). " +
    "Only whoever administers the server can give a definite answer.",
  vendorPlaceholder: "hosting provider",
  stale: (days: number) => `This was last verified ${days} days ago. Check the source for the current status.`,

  actNoHosts: "The domain's web hosts (A/AAAA records) could not be resolved. Check the domain name.",
  actHostingUnlisted: (name, incident) =>
    `${name} runs the web server. Its ${incident} status is not recorded in this tool. Check the provider's official notice or ask using the template below.`,
  actPatched: (name, conf, date, action) => `${name} reports the fix as complete (${conf}, ${date}). ${action}`,
  actInProgress: (name, action) =>
    `${name} is still patching. Until the official completion notice, consider restricting access or taking the site offline for a while. ${action}`,
  actUnknown: (name, action) => `${name}'s status could not be confirmed. ${action} Ask using the template below.`,
  actSaas: (name, action) => `${name} runs the site on its own platform; there is no server PHP for you to manage. ${action}`,
  actPaas: (name) =>
    `${name} is an application platform (PaaS). If the site uses PHP, you (or your agency) control the PHP version through the container image or build settings. Ask your agency whether the site uses PHP and whether it has been updated to a fixed release and redeployed.`,
  actCloud: (name) =>
    `${name} is IaaS: PHP runs on a server you or your agency manage. Ask the server administrator to update PHP or the OS packages. Vuls or a similar package scanner can confirm from inside.`,
  actCDN: (name) =>
    `The site is served through ${name} (CDN). The server that actually runs PHP is not visible from outside. Ask your agency or administrator where the origin is hosted and whether PHP is updated.`,
  actDistrustedRoot: (host, root) =>
    `Warning: the certificate of ${host} chains to "${root}". Firefox and others no longer trust that root, so visitors' browsers show an error. Replace it with a certificate from another CA now.`,
  actCaIncident: (name, title, status, action) => `This site's certificate was issued by ${name}, which has announced "${title}" (${status}). ${action}`,
  actOtherIncident: (name, title, status, action) =>
    `${name} has announced "${title}" (${status}). If this site or a related service runs on ${name}: ${action}`,
  actUnmatched: (list) => `The web server's network is not in this tool's list: ${list}. Ask that operator (or your server administrator).`,
  actHTTPFailed: (err) => `The front page could not be fetched, so no PHP check was made (${err}).`,
  actHTTPStatus: (status) =>
    `The front page answered HTTP ${status}, so no PHP check was made. An error page from a CDN or firewall says nothing about the server that runs the site.`,
  actPHPLikely: (ev) => `The front page response strongly indicates PHP (${ev}). This site is in scope for the vulnerability.`,
  actPHPPossible: (ev) => `The front page has weak evidence of PHP (${ev}). Confirm with your agency.`,
  actPHPUnlikely: "The front page looks like a non-PHP stack. Admin panels, contact forms and subdomains may still use PHP; confirm with your agency.",
  actPHPNone: "No PHP signals on the front page. They may be hidden from outside, so ask your agency whether the site uses PHP.",
  actVersionFixed: (v) => `The PHP version in the response header, ${v}, is at or above the fixed release.`,
  actVersionBelow: (v, fixed) =>
    `The PHP version in the response header, ${v}, is below the fixed release (${fixed}). Providers and distributions often patch without changing the version string, so this alone does not prove exposure. Confirm with the provider.`,
  actVersionUnfixed: (v) =>
    `The PHP version in the response header, ${v}, has no official fix from php.net. Ask the provider whether they applied their own patch, and plan a move to 8.2 or later. A site built on old PHP may need its frameworks and libraries updated and retested before it can move, which takes time. Ask your web agency for the scope and schedule, and until the move is done, consider restricting access or taking the site offline for a while. Taking a site offline to protect its users can be the right call.`,
  actLongCookie:
    "Warning: an abnormally long PHPSESSID cookie was returned. JPCERT/CC (Japan's CERT) lists this as a possible indicator of php2shell exploitation. Contact your server administrator or hosting provider now.",
  actOnlyFix:
    'The only fix is updating PHP to a fixed release (8.5.12 / 8.4.27 / 8.3.36 / 8.2.35) or the provider\'s patched build. An external "AI vulnerability assessment" does not update the PHP on your server. If you received a quote, finish the checks above first.',
  actRefs: () => `Reference: the PHP project's security advisory, ${phpAdvisory}`,

  template: (vendor, domain) => `Subject: Status of the PHP vulnerability fix (CVE-2026-109618 / CVE-2026-109619)

To: ${vendor}

Regarding the PHP vulnerabilities published on 2026-10-21 (CVE-2026-109618 and CVE-2026-109619, "php2shell"),
could you confirm the following for our site (${domain})?

1. The PHP version our site runs on
2. Whether the fixed release (8.5.12 / 8.4.27 / 8.3.36 / 8.2.35) or an equivalent patch has been applied,
   and if not, when it will be
3. If the site runs PHP 8.1 or older: whether a move to a supported version is needed, the steps, and the cost
4. Any sign of suspicious access or compromise since October 17
   (JPCERT/CC, Japan's CERT, lists abnormally long PHPSESSID cookies among the indicators)
5. Which company actually does the update work, including any subcontractor, and who our contact is
6. Whether anything is needed in the meantime until the update is done (for example, restricting access or taking the site offline for a while)

Reference:
- PHP security advisory: ${phpAdvisory}

Thank you.`,

  ui: {
    nav: { home: "Check", providers: "Provider status", guide: "Guide", tools: "Tools", about: "About" },
    menu: "Menu",
    skip: "Skip to content",
    privacy: "Privacy",
    terms: "Terms",
    switchLang: "日本語",
    nowCovering: (incident: string) => `Now covering: ${incident}`,
    incidentLabel: (name: string, cves: string[]) => (cves.length > 0 ? `${name} (${cves.join(" / ")})` : name),
    home: {
      titleLines: ["Who runs your site,", "and how are they handling security?"],
      sub: "Enter a domain. OpenVMap finds the companies behind its web, DNS, mail and certificate from public data, shows what each has announced about security incidents, and tells you whom to ask next.",
      reassure: ["Not for profit, no account", "Domains are not kept in readable form", "One request to the site's front page"],
      proof: (n: number, official: number, date: string) => `${n} providers tracked · ${official} entries from official notices · updated ${date}`,
      problemEyebrow: "Why it matters",
      problemTitle: "The fix comes from whoever runs the server",
      problemBody:
        "A flaw in the server's software is fixed by the company that manages the server, not by the site's owner. Yet many owners left the site to an agency and do not know whose servers it runs on.",
      solutionBody: "OpenVMap names those companies from public DNS, routing data and the certificate, and puts what each has announced side by side.",
      tagline: [
        ["First,", "find", "out", "who", "to", "ask."],
        ["The", "fix", "starts", "there."],
      ],
      benefitsEyebrow: "What you get",
      benefitsTitle: "What the result page tells you",
      benefits: (n: number, others: string, incident: string) => [
        { title: "Whom to ask", body: "The company behind each of web, DNS, mail and the certificate, even for a site an agency set up." },
        { title: "Every notice in one place", body: `${incident} status for ${n} providers, each with a link to its notice and the date it was checked.` },
        { title: "The providers' own incidents", body: `Incidents announced by ${others} appear when the site uses that provider.` },
        { title: "A message you can send", body: "Questions for your agency or host, written for your result. Copy them and send." },
        { title: "No load on the site", body: "One ordinary visit to the front page and the start of one connection to read the certificate. Nothing else." },
      ],
      stepsEyebrow: "How it works",
      stepsTitle: "Three steps to your next move",
      howSteps: [
        { title: "Enter the domain", body: "Type your site's domain and press Check." },
        {
          title: "The providers are found",
          body: "Public DNS and routing data, then the front page's answer and the certificate, name the platform and the certificate authority.",
        },
        { title: "Status and next steps", body: "Each provider's notice, what to do now, and a message to send, on one page." },
      ],
      sourcesEyebrow: "Where the data comes from",
      sourcesTitle: "Only information you can trace to a source",
      sourcesBody:
        "Each provider's status is written from what the provider announced. It can be wrong, so every entry has the date it was checked and a link to its source. No LLM is used to check a site.",
      statProviders: "providers tracked",
      statOfficial: "entries from official notices",
      statUpdated: "last updated",
      seeProviders: "See provider status",
      openSource: "Code and data are on GitHub (MIT / CC BY 4.0)",
      faqEyebrow: "FAQ",
      faqTitle: "Before you check",
      faq: [
        { q: "Does it cost anything?", a: "No. It is a free tool run by one person, with no account to create, no paid tier and no sales contact." },
        {
          q: "Is the domain I enter stored?",
          a: "Not in readable form. To avoid repeat visits to the same site, the PHP result is kept for an hour under a value the domain cannot be recovered from. No server access logs are kept.",
        },
        {
          q: "Does checking put load on the site?",
          a: "One ordinary GET of the front page and the start of one TLS connection to read who issued its certificate. No attacks, logins, directory probing or port scans.",
        },
        {
          q: "Can it tell whether PHP is patched?",
          a: "No. That is not visible from outside. The result tells you whom to ask and what to ask; confirm with the company that runs the server or your agency.",
        },
        { q: "Which domains may I check?", a: "Domains you manage or were asked to check. Result pages are not indexed by search engines." },
        {
          q: "Where does the provider status come from?",
          a: "From the providers' own announcements. It can be wrong, so always check the source. Official means the provider's page; secondary means press or third party summaries. Both carry a checked date and a source.",
        },
        {
          q: "Does unknown mean the provider has not patched?",
          a: "No. It means no official notice has been found. Use the message on the result page to ask them directly.",
        },
        {
          q: "Is an LLM used to check a site?",
          a: "No. Every conclusion can be reproduced from recorded observations: public DNS, routing data, the front page's answer and the certificate.",
        },
        { q: "Who runs it?", a: "One person. The code and the provider data are public on GitHub, where corrections are welcome." },
      ],
      finalTitle: "Find out who runs your site",
      finalBody: "Not for profit, no account. The domain you enter is not stored in readable form.",
    },
    inputLabel: "Domain",
    inputPlaceholder: "example.com",
    submit: "Check",
    ownDomains: "Use it on domains you manage or were asked to check.",
    readGuide: "Read the guide",
    checking: "Checking (public DNS and routing lookups)…",
    invalid: (input) => `"${input}" is not a domain name. Enter it as example.com.`,
    noDomain: "No domain was given to check.",
    phpChecking: "Looking for signs of PHP with one ordinary request to the front page…",
    phpLimited: "Too many checks in a short time, so the PHP check is paused for you. Try again in about a minute.",
    phpUnavailable: "The PHP check could not be run. Try again later.",
    phpCachedNote: (min) => `This result is from ${min} minutes ago. To send fewer requests to one site, PHP check results are kept for an hour.`,
    copyJson: "Copy JSON",
    colRole: "Role",
    colHost: "Host",
    colAddress: "Address / CNAME",
    colNetwork: "Network (AS)",
    colProvider: "Provider",
    roleLabels: { web: "Web", cname: "Web (CNAME)", http: "Web (response header)", ns: "DNS", mx: "Mail", tls: "TLS certificate" },
    checksTitle: "What this check covers",
    checkFound: (name: string) => `Affected: this site uses ${name}`,
    checkClear: "Not found on this site",
    checkClearIssuer: (issuer: string) => `Not found on this site (certificate issued by ${issuer})`,
    checkPending: "Checking…",
    checkFailed: "Could not be checked",
    checkMissing: {
      page: "Not fully checked: the front page did not answer, so its headers could not be read",
      cert: "Not fully checked: the certificate could not be read",
    },
    checksNote: '"Not found" means public DNS, routing data, the front page\'s headers and the certificate showed no sign of that provider.',
    otherIncidents: "The provider's own security incidents",
    copy: "Copy",
    copied: "Copied",
    detail: "Details",
    providersTitle: "Provider security status",
    providersIntro:
      "Each provider's official notice (official) and press or roundup articles (secondary), summarised. It can be wrong, so always check the source.",
    colName: "Provider",
    colKind: "Kind",
    colStatus: (incident: string) => `${incident} status`,
    colConfidence: "Confidence",
    colDate: "Date",
    colSource: "Source",
    updated: "Last updated:",
    link: "link",
    vendorTitle: (name) => `${name}: security status`,
    summary: "Summary",
    identifiers: "How this tool recognises the provider",
    asns: "AS numbers",
    nsSuffixes: "Name servers",
    cnameSuffixes: "CNAME",
    httpHeaders: "Response headers (names)",
    certIssuers: "Text in the certificate issuer's organization (O)",
    distrustedRoots: "Root certificates browsers no longer trust",
    mxSuffixes: "Mail servers",
    asNames: "Text in the AS name",
    noIncident: "This provider does not run PHP on the customer's behalf, so no status is recorded.",
    correction: "Report a correction (GitHub)",
    verifiedOn: "Verified:",
    notFound: "Not found.",
    tagline: "A free, non-commercial tool run by an individual. Domains you enter are not stored in readable form.",
    mapCaption: "The companies behind one domain",
    steps: ["Public DNS", "Routing (AS)", "Front page", "Certificate"],
    exampleDomain: "example.com",
  },

  tools: {
    title: "Free security tools for small teams",
    eyebrow: "Open source",
    intro:
      "Open source tools for engineers at companies without a security team, one pick for each job. Every tool is under an open source license and free to use; where the project also sells a paid tier, it says so. Each tool's last commit, latest release, license, GitHub stars and OpenSSF Scorecard score are checked daily. Stars show how widely a tool is used, not that it is safe; the Scorecard score rates how the project protects its own code and releases.",
    jobs: "Jobs",
    pick: "Pick",
    alternative: "Alternative",
    byAuthor: "By the author of this site",
    tryIt: "Try it",
    license: "License",
    lastCommit: "Last commit",
    latestRelease: "Latest release",
    stars: "GitHub stars",
    scorecard: "OpenSSF Scorecard",
    scorecardOf: (score: number, date: string) => `${score} / 10 · ${date}`,
    notScored: "not scored",
    incident: "Security incident",
    advisory: "Advisory",
    archived: "Archived by its maintainers: no more fixes will ship.",
    quiet: (days: number) => `No commits for over ${days} days. Check that it is still maintained.`,
    suggest: "Suggest an addition or correction (data/tools.yaml)",
    checked: "Checked on GitHub",
  },
  costLabels: { free: "free", "open-core": "free, with a paid tier" },
  runsLabels: { cli: "command line", ci: "CI or bot", service: "self-hosted service", rules: "rule set" },
  statusLabels: {
    patched: "patched",
    in_progress: "in progress",
    unknown: "unknown",
    conflicting: "conflicting reports",
    "n/a": "customer-managed",
  },
  confLabels: { official: "official notice", secondary: "secondary source", "": "no source" },
  kindLabels: {
    hosting: "hosting",
    saas: "site platform",
    paas: "application platform (PaaS)",
    ca: "certificate issuer (CA)",
    cloud: "cloud (IaaS)",
    cdn: "CDN (hides the origin)",
    dns: "DNS only",
    mail: "mail only",
  },
  verdictLabels: { likely: "likely PHP", possible: "possibly PHP", unlikely: "looks non-PHP", none: "no signals" },
  versionLabels: {
    fixed_or_later: "fixed release or later",
    below_fixed_release: "below the fixed release; may be a provider backport",
    no_official_fix: "no official fix from php.net",
    unknown: "cannot tell",
  },
};
