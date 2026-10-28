# php2shell: a guide for small businesses

Edition of October 26, 2026. Written for organizations without a security team whose website is built
or hosted by someone else: a web agency, a freelancer, or a shared hosting company.

## What happened

On October 21, 2026 the PHP project released fixes for two vulnerabilities, CVE-2026-109618 and
CVE-2026-109619, known together as php2shell. They let an attacker run code on the server without
logging in, and they affect almost every PHP installation that serves web requests, from PHP 5.4 to 8.5:
PHP-FPM, Apache with mod_php, php-cgi, FrankenPHP and LiteSpeed. The PHP project rates the risk highest
for mod_php.

- Fixed releases: **PHP 8.5.12 / 8.4.27 / 8.3.36 / 8.2.35**
- PHP 8.1 and older get no new releases. The PHP project published minimal source backports for 7.4,
  8.0 and 8.1, and many hosting companies and Linux distributions applied their own fixes.
- Attack attempts were observed from October 17, before the fixes were published.
- The PHP project's advisory: https://www.php.net/archive/2026.php (October 21, 2026)

## There is one fix

**Update PHP to a fixed release.** That is all.

Updating WordPress, plugins or themes does not fix it, because the flaw is in PHP itself. A firewall or
WAF can block some attack paths, and the PHP project lists settings that reduce exposure, but none of
these make a server safe.

## About urgent "AI security audit" offers

Since the announcement, many businesses have received sales emails along these lines (an illustration, not a real offer):

> A critical PHP vulnerability was announced on October 21. We offer an express AI-driven web
> vulnerability assessment: 10 business days as standard, express delivery in 1 day.

Points to keep in mind:

1. **An assessment does not update the PHP on your server.** After ten days and a report that says
   "vulnerable", the fix is still the same: update PHP. On shared hosting your host does that; on your
   own server, whoever administers it does.
2. **An outside scan cannot tell whether PHP is patched.** Hosts often apply the fix without changing
   the version number. A scan that reports "unpatched" from the version string alone is not reliable.
3. **Web security testing is not worthless.** For a web application your business had built, a test
   with a stated scope and method, at a calm time, has value. It is not something to buy "now, because
   of php2shell".
4. Free open-source tools do similar work (Strix, Nuclei, OWASP ZAP). They need someone technical to run
   them, but "AI" is not a reason for the work to be expensive.

## What to do now, in order

### 1. Find out who runs your site

Enter your domain (for example example.com) on this site's home page.

The result names the companies behind your website (for example GoDaddy, Hostinger, OVHcloud,
SiteGround, IONOS, AWS or DigitalOcean) and what each has announced about php2shell.

If you have more than one domain (a careers site, a campaign site, a shop), check them all. Sites an
agency set up on a different server are easy to forget.

### 2. What you do depends on the kind of provider

| Kind                      | Examples                                                                      | Who updates PHP                               | What you do                                                                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared or managed hosting | GoDaddy, Hostinger, SiteGround, IONOS, OVHcloud, DreamHost, WP Engine, Kinsta | The host                                      | Confirm completion in the host's own notice. Check your PHP version in the control panel; if it is 8.1 or older, plan a move to 8.2 or later |
| VPS or cloud              | DigitalOcean, Linode, Vultr, Hetzner, AWS EC2 and Lightsail, Google Cloud     | You, or your agency or maintenance contractor | Find out who administers the server and ask them to update. Tools such as Vuls can check from inside the server                              |
| Behind a CDN              | Cloudflare, Fastly                                                            | Not visible from outside                      | Ask your agency where the origin server is and whether it is updated                                                                         |
| The agency's own server   | Unknown                                                                       | The agency                                    | Ask them with the template                                                                                                                   |

### 3. Ask your agency or host

The end of each check result has a message template. It asks six things:

1. Which PHP version our site runs on
2. Whether the fixed release, or an equivalent patch, has been applied, and if not, when it will be
3. If the site runs PHP 8.1 or older, whether a move to a supported version is needed, and how and at what cost
4. Whether there are signs of suspicious access or compromise since October 17
5. Which company actually does the update (including any subcontractor), and who our contact is
6. Whether we need a measure until the update is done, such as restricting access or taking the site offline for a while

When building and maintaining a site has been passed through several companies, nobody may know who is
supposed to update PHP. Question 5 is there to make one person responsible.

### 4. If a server is not fixed yet

Consider restricting access, or taking the site offline, until the update is done. Many hosting
companies and online services did exactly that on October 21 and 22. A site that is offline for a few
hours costs far less than a server taken over by an attacker.

Knowing an update is needed does not mean it can be applied right away. A site that has not been
maintained for years may still run PHP 8.1 or older, which gets no new releases. Then raising the PHP
version is not enough: the framework and libraries need updating too, and someone has to test that
nothing broke, which can take weeks. Ask your agency for the scope and the timeline, and keep the site
restricted or offline until it is done. Taking a site offline to protect its users is often the right
call, not proof of neglect.

### 5. Check for signs of compromise

Advisories suggest checking past HTTP responses for an abnormally long PHPSESSID cookie, among other
signs. Ask whoever can read the server logs (your host or maintenance company) to check, as question 4
of the template.

## For next time

Many sites that could not be fixed quickly were held up by how maintenance was arranged, not by the
technology. Maintenance, updates and testing are not costs to cut; they are what lets you fix the next
problem quickly. When things are calm:

- Confirm in writing whether your maintenance contract covers updates to the operating system and PHP, and who does them.
- Keep this tool's result as a list of who is responsible for each site: for web hosting, DNS, mail and certificates, the company and the contact.
- For sites still on an old PHP, plan the migration and its budget. The PHP project publishes the end of support for each version: https://www.php.net/supported-versions.php
- Ask your agency whether there is a test environment where updates can be tried before the live site, and a procedure for checking that the site still works.

## What this tool cannot do

- Tell from outside whether PHP is patched.
- Find PHP that leaves no trace on the front page (admin areas, APIs, forms).
- Track every provider in real time. The statuses are written from the providers' announcements and can be out of date: always check the source.

## Sources

- PHP security advisory, October 21, 2026: https://www.php.net/archive/2026.php
- PHP supported versions: https://www.php.net/supported-versions.php
- In Japan: IPA https://www.ipa.go.jp/security/security-alert/2026/alert20261022.html and JPCERT/CC https://www.jpcert.or.jp/at/2026/at260033.html
- Each provider's own announcement is linked from the [provider status list](/providers).
