---- MODULE PageFetch ----
EXTENDS Naturals, Sequences

Addresses == {"public", "private", "cloudflare"}
IsPublicAddress(a) == a # "private"
IsCloudflareAddress(a) == a = "cloudflare"

WebHosts == <<"apex", "www">>
Names == {"apex", "www", "elsewhere"}
Literal == [public |-> "literal-public", private |-> "literal-private", cloudflare |-> "literal-cloudflare"]
Hosts == Names \cup {Literal[a] : a \in Addresses}
LiteralAddress(h) == CHOOSE a \in Addresses : Literal[a] = h

Urls == [scheme : {"http", "https"}, host : Hosts, port : {"80 or 443", "other"}]
Candidates == <<[scheme |-> "https", host |-> "apex", port |-> "80 or 443"],
                [scheme |-> "https", host |-> "www", port |-> "80 or 443"],
                [scheme |-> "http", host |-> "apex", port |-> "80 or 443"],
                [scheme |-> "http", host |-> "www", port |-> "80 or 443"]>>

RedirectsPerCandidate == 5
RequestsPerCheck == 8

DnsAnswers(h) == IF h \in Names THEN SUBSET Addresses ELSE {{LiteralAddress(h)}}
ConnectByName(h) == IF h \in Names THEN Addresses ELSE {LiteralAddress(h)}
TlsAuthenticatesName(a) == a # "private"

VARIABLES phase, candidate, url, redirects, requests, checked, server, certHost,
          pageRequestsDelivered, certProbesConnected
vars == <<phase, candidate, url, redirects, requests, checked, server, certHost,
          pageRequestsDelivered, certProbesConnected>>

Init ==
    /\ phase = "request"
    /\ candidate = 1
    /\ url = Candidates[1]
    /\ redirects = 0
    /\ requests = 0
    /\ checked = {}
    /\ server = "none"
    /\ certHost = 1
    /\ pageRequestsDelivered = {}
    /\ certProbesConnected = {}

StartCertProbes ==
    /\ phase' = "cert probe"
    /\ certHost' = 1

NextCandidate ==
    /\ checked' = {}
    /\ server' = "none"
    /\ IF candidate = Len(Candidates)
         THEN /\ StartCertProbes
              /\ UNCHANGED <<candidate, url, redirects>>
         ELSE /\ candidate' = candidate + 1
              /\ url' = Candidates[candidate + 1]
              /\ redirects' = 0
              /\ phase' = "request"
              /\ UNCHANGED certHost

RequestBudgetSpent ==
    /\ phase = "request"
    /\ requests >= RequestsPerCheck
    /\ StartCertProbes
    /\ UNCHANGED <<candidate, url, redirects, requests, checked, server, pageRequestsDelivered, certProbesConnected>>

PortRefused ==
    /\ phase = "request"
    /\ requests < RequestsPerCheck
    /\ url.port = "other"
    /\ requests' = requests + 1
    /\ NextCandidate
    /\ UNCHANGED <<pageRequestsDelivered, certProbesConnected>>

PublicAddressesRefuse ==
    /\ phase = "request"
    /\ requests < RequestsPerCheck
    /\ url.port = "80 or 443"
    /\ \E answer \in DnsAnswers(url.host) :
         ~ (answer # {} /\ \A a \in answer : IsPublicAddress(a))
    /\ requests' = requests + 1
    /\ NextCandidate
    /\ UNCHANGED <<pageRequestsDelivered, certProbesConnected>>

PublicAddressesAccept ==
    /\ phase = "request"
    /\ requests < RequestsPerCheck
    /\ url.port = "80 or 443"
    /\ \E answer \in DnsAnswers(url.host) :
         /\ answer # {}
         /\ \A a \in answer : IsPublicAddress(a)
         /\ checked' = answer
    /\ requests' = requests + 1
    /\ phase' = "send"
    /\ UNCHANGED <<candidate, url, redirects, server, certHost, pageRequestsDelivered, certProbesConnected>>

Direct == {a \in checked : ~ IsCloudflareAddress(a)}

Deliver(a, route) ==
    /\ pageRequestsDelivered' = pageRequestsDelivered \cup {[address |-> a, route |-> route, scheme |-> url.scheme]}
    /\ server' = a
    /\ phase' = "answer"
    /\ UNCHANGED <<candidate, url, redirects, requests, checked, certHost, certProbesConnected>>

TlsHandshakeFails ==
    /\ NextCandidate
    /\ UNCHANGED <<requests, pageRequestsDelivered, certProbesConnected>>

SocketToCheckedAddress ==
    /\ phase = "send"
    /\ Direct # {}
    /\ url.scheme = "http"
    /\ \E a \in Direct : Deliver(a, "socket to the checked address")

SocketByName ==
    /\ phase = "send"
    /\ Direct # {}
    /\ url.scheme = "https"
    /\ \E a \in ConnectByName(url.host) :
         IF TlsAuthenticatesName(a) THEN Deliver(a, "socket by name") ELSE TlsHandshakeFails

PlainHttpCannotBePinned ==
    /\ phase = "send"
    /\ Direct = {}
    /\ url.scheme = "http"
    /\ NextCandidate
    /\ UNCHANGED <<requests, pageRequestsDelivered, certProbesConnected>>

FetchThroughEdge ==
    /\ phase = "send"
    /\ Direct = {}
    /\ url.scheme = "https"
    /\ \E a \in ConnectByName(url.host) :
         IF TlsAuthenticatesName(a) THEN Deliver(a, "fetch through the edge") ELSE TlsHandshakeFails

AnswerAccepted == phase = "answer"

SiteFailsOrAnswers4xx ==
    /\ AnswerAccepted
    /\ NextCandidate
    /\ UNCHANGED <<requests, pageRequestsDelivered, certProbesConnected>>

SiteAnswersPage ==
    /\ AnswerAccepted
    /\ StartCertProbes
    /\ UNCHANGED <<candidate, url, redirects, requests, checked, server, pageRequestsDelivered, certProbesConnected>>

RedirectRefused ==
    /\ AnswerAccepted
    /\ NextCandidate
    /\ UNCHANGED <<requests, pageRequestsDelivered, certProbesConnected>>

SiteRedirects ==
    /\ AnswerAccepted
    /\ redirects < RedirectsPerCandidate
    /\ \E next \in Urls : url' = next
    /\ redirects' = redirects + 1
    /\ phase' = "request"
    /\ checked' = {}
    /\ server' = "none"
    /\ UNCHANGED <<candidate, requests, certHost, pageRequestsDelivered, certProbesConnected>>

NextCertHost ==
    IF certHost = Len(WebHosts)
      THEN /\ phase' = "done" /\ UNCHANGED certHost
      ELSE /\ certHost' = certHost + 1 /\ UNCHANGED phase

CertProbeRefused ==
    /\ phase = "cert probe"
    /\ \E answer \in DnsAnswers(WebHosts[certHost]) :
         \/ answer = {}
         \/ \E a \in answer : ~ IsPublicAddress(a)
         \/ \A a \in answer : IsCloudflareAddress(a)
    /\ NextCertHost
    /\ UNCHANGED <<candidate, url, redirects, requests, checked, server, pageRequestsDelivered, certProbesConnected>>

CertProbeConnects ==
    /\ phase = "cert probe"
    /\ \E answer \in DnsAnswers(WebHosts[certHost]) :
         /\ answer # {}
         /\ \A a \in answer : IsPublicAddress(a)
         /\ \E a \in answer :
              /\ ~ IsCloudflareAddress(a)
              /\ certProbesConnected' = certProbesConnected \cup {a}
    /\ \/ phase' = "done" /\ UNCHANGED certHost
       \/ NextCertHost
    /\ UNCHANGED <<candidate, url, redirects, requests, checked, server, pageRequestsDelivered>>

Done == phase = "done" /\ UNCHANGED vars

Next ==
    \/ RequestBudgetSpent
    \/ PortRefused
    \/ PublicAddressesRefuse
    \/ PublicAddressesAccept
    \/ SocketToCheckedAddress
    \/ SocketByName
    \/ FetchThroughEdge
    \/ PlainHttpCannotBePinned
    \/ SiteFailsOrAnswers4xx
    \/ SiteAnswersPage
    \/ SiteRedirects
    \/ RedirectRefused
    \/ CertProbeRefused
    \/ CertProbeConnects
    \/ Done

Spec == Init /\ [][Next]_vars

TypeOK ==
    /\ phase \in {"request", "send", "answer", "cert probe", "done"}
    /\ candidate \in 1..Len(Candidates)
    /\ url \in Urls
    /\ redirects \in 0..RedirectsPerCandidate
    /\ checked \subseteq Addresses
    /\ certHost \in 1..Len(WebHosts)

PrivateDeliveries == {d \in pageRequestsDelivered : d.address = "private"}
NoPageRequestReachesPrivateAddress == PrivateDeliveries = {}
NoCertProbeReachesPrivateAddress == "private" \notin certProbesConnected
PageRequestsWithinBudget == requests <= RequestsPerCheck
====
