// Legal: Terms of Service + Privacy Policy for BudgetSmart, published by
// Tech Myriad Emporium LLC (Ohio). Written to be readable, upfront and
// honest about compliance status — nothing is claimed that isn't held.
// DRAFTED FOR ATTORNEY REVIEW — see the session notes before relying on
// these for regulated activity (money movement, ACH, card acquiring).
import { useEffect } from "react";
import { Footer, Nav } from "./App";

const LEGAL_EMAIL = "budgetsmart.techmyriademporium@gmail.com";
const EFFECTIVE = "July 8, 2026";

function LegalShell({ title, children }: { title: string; children: React.ReactNode }) {
  useEffect(() => { document.title = `${title} — BudgetSmart`; }, [title]);
  return (
    <>
      <Nav />
      <section style={{ paddingTop: 40 }}>
        <div className="wrap help-article">
          <div className="eyebrow">// legal</div>
          <h1 className="section-title">{title}</h1>
          <p className="help-body" style={{ marginTop: 6 }}>
            <b>Tech Myriad Emporium LLC</b>, an Ohio limited liability company (“<b>TME</b>,” “we,” “us”).
            We operate online only — there is no retail premises. Contact:{" "}
            <a href={`mailto:${LEGAL_EMAIL}`}>{LEGAL_EMAIL}</a>. Effective date: <b>{EFFECTIVE}</b>.
          </p>
          <div className="help-body">{children}</div>
          <p style={{ marginTop: 32 }}>
            <a className="btn" href="/terms">Terms of Service</a>{" "}
            <a className="btn" href="/privacy">Privacy Policy</a>{" "}
            <a className="btn" href="/help">Help Center</a>
          </p>
        </div>
      </section>
      <Footer />
    </>
  );
}

const H = ({ n, t }: { n: string; t: string }) => <h3 id={n}>{n}. {t}</h3>;

/* ================================================================== *
 * TERMS OF SERVICE
 * ================================================================== */
export function TermsPage() {
  return (
    <LegalShell title="Terms of Service">
      <p>
        These Terms of Service (the “Terms”) are a binding agreement between you and TME governing the
        BudgetSmart applications, website, and related services (together, the “Service”). By installing the app,
        creating an account, or using the Service, you accept these Terms. If you do not accept them, do not use
        the Service. You consent to doing business electronically and to receiving records electronically under the
        federal E-SIGN Act (15 U.S.C. § 7001 et seq.) and Ohio's Uniform Electronic Transactions Act
        (Ohio Rev. Code Ch. 1306).
      </p>

      <H n="1" t="The Service and your license" />
      <p>
        BudgetSmart is personal-finance software: budgeting, transaction tracking, goals, debt planning,
        forecasting and related tools. We grant you a personal, non-exclusive, non-transferable, revocable license
        to install and use the app for your own (or your household's / licensed team's) money management. You may
        not resell, sublicense, reverse engineer except as permitted by law, or use the Service to build a
        competing product.
      </p>

      <H n="2" t="Not financial, tax, legal or investment advice" />
      <p>
        The Service produces <b>estimates and educational information only</b> — including budgets, forecasts,
        payoff plans, tax projections and credit-score estimates. It is not financial, investment, tax, accounting
        or legal advice; we are not a fiduciary, investment adviser, broker-dealer, credit repair organization
        (15 U.S.C. § 1679 et seq.), or tax preparer. Market data may be delayed or wrong. Verify any number that
        matters with a qualified professional before acting on it.
      </p>

      <H n="3" t="Your account, your security responsibilities, and hacked accounts" />
      <p>
        You are responsible for the security of your account: your password, your email inbox, your devices, and
        anyone you share access or seats with. Use a strong unique password and enable two-factor authentication —
        the Service offers it for free.
      </p>
      <p>
        <b>Assumption of risk.</b> You acknowledge that no online service can be made perfectly secure, and that an
        account can be compromised through no fault of ours — phishing, password reuse, malware on your device, SIM
        swaps, or someone you shared credentials with. <b>To the maximum extent permitted by applicable law, TME is
        not liable for losses arising from unauthorized access to your account that results from compromise of your
        credentials, devices or email, and is not obligated to refund subscription fees, redemption codes, seats or
        other amounts in connection with such unauthorized access.</b> We will, however, make commercially
        reasonable efforts to help you recover a compromised account — contact us immediately at{" "}
        <a href={`mailto:${LEGAL_EMAIL}`}>{LEGAL_EMAIL}</a>, and we will attempt verification, lockdown and
        restoration. Nothing in this section waives rights that cannot be waived by law, including (if and when the
        Service ever transmits money) consumer error-resolution rights under the Electronic Fund Transfer Act
        (15 U.S.C. § 1693 et seq.) and Regulation E (12 C.F.R. Part 1005).
      </p>

      <H n="4" t="Subscriptions, billing and refunds" />
      <p>
        The base app is free. Paid tiers, family plans, and Custom/Enterprise plans are billed as described at
        purchase (monthly or annual; Custom/Enterprise are annual only). Payments are processed by third-party
        payment processors (currently Stripe, Inc.); <b>we never receive or store full card numbers</b> — card data
        is handled by processors validated under the Payment Card Industry Data Security Standard (PCI DSS v4)
        and the operating rules of the card networks (Visa Core Rules, Mastercard Rules, Discover DISC program).
        Subscriptions renew until cancelled; cancel any time and paid features run to the end of the paid period.
        Except where required by law or expressly stated (including Section 3), fees are non-refundable.
        Redemption codes are single-use and are void where prohibited.
      </p>

      <H n="5" t="Compliance program" />
      <p>
        We operate — and are building out — a written compliance program appropriate to a financial-software
        company, referencing the following regimes. <b>We state plainly what applies today versus what applies when
        future features launch</b>, because overstating compliance is itself a violation:
      </p>
      <ul>
        <li>
          <b>Sanctions (operative today).</b> We comply with U.S. sanctions administered by the Office of Foreign
          Assets Control under the International Emergency Economic Powers Act (50 U.S.C. § 1701 et seq.), the
          Trading with the Enemy Act (50 U.S.C. § 4301 et seq.), and 31 C.F.R. Parts 500–599. The Service may not
          be used by persons on the SDN List or in embargoed jurisdictions, and we may screen and block accounts
          and orders accordingly.
        </li>
        <li>
          <b>AML / KYC (operative as applicable; expands before any money movement).</b> Our program references the
          Bank Secrecy Act (31 U.S.C. § 5311 et seq.), FinCEN's implementing regulations (31 C.F.R. Chapter X),
          and the customer identification requirements of USA PATRIOT Act § 326 (31 U.S.C. § 5318(l)) and the CDD
          Rule (31 C.F.R. § 1010.230). We may require identity verification, and may refuse, suspend or report
          activity as required by law.
        </li>
        <li>
          <b>Money transmission (not yet applicable — stated for transparency).</b> BudgetSmart does not currently
          hold or transmit customer funds. Before any money-movement feature launches, we will register with FinCEN
          as a money services business where required (31 C.F.R. § 1022.380) and obtain state money transmitter
          licenses (including under Ohio Rev. Code Ch. 1315) or operate through appropriately licensed partners.
        </li>
        <li>
          <b>ACH (upon launch of bank-transfer features).</b> Any ACH activity will be conducted in accordance with
          the Nacha Operating Rules &amp; Guidelines through an ODFI partner, including Regulation E error
          resolution for consumers.
        </li>
        <li>
          <b>Data protection (operative today).</b> See our <a href="/privacy">Privacy Policy</a>, which is written
          to the Gramm-Leach-Bliley Act (15 U.S.C. §§ 6801–6809) and FTC Safeguards Rule (16 C.F.R. Part 314), the
          California Consumer Privacy Act as amended by the CPRA (Cal. Civ. Code § 1798.100 et seq.), the Virginia
          CDPA (Va. Code § 59.1-575 et seq.), the Colorado Privacy Act (C.R.S. § 6-1-1301 et seq.), the EU/UK GDPR
          (Regulation (EU) 2016/679) for users in those regions, COPPA (15 U.S.C. §§ 6501–6506), and Ohio law
          including the Ohio Data Protection Act (Ohio Rev. Code Ch. 1354) and Ohio's breach-notification statute
          (Ohio Rev. Code § 1349.19).
        </li>
        <li>
          <b>Security frameworks (program in progress — not yet certified).</b> Our security program is modeled on
          the NIST Cybersecurity Framework 2.0 and ISO/IEC 27001:2022, and we are working toward SOC 2 Type I and
          Type II attestations under the AICPA Trust Services Criteria. We additionally track 23 NYCRR Part 500
          (NY Department of Financial Services) and the EU Digital Operational Resilience Act (Regulation (EU)
          2022/2554, “DORA”) as benchmarks for financial-grade operations. <b>We do not currently claim SOC 2,
          ISO 27001 certification, or PCI DSS attestation of our own systems</b> — card data is kept out of our
          systems entirely (Section 4), and certifications will be announced when earned, not before.
        </li>
      </ul>

      <H n="6" t="Acceptable use" />
      <p>
        Don't use the Service to break the law (including AML and sanctions law), to infringe others' rights, to
        probe or disrupt our systems, to scrape or resell data, or to misrepresent your identity. Seats on shared
        plans are for real, individual people. We may suspend or terminate accounts that violate these Terms.
      </p>

      <H n="7" t="Your data" />
      <p>
        Your financial records belong to you. The current app stores them locally on your device; features you
        enable (plan sync, email recaps, shared-plan overviews) send only the data described in the{" "}
        <a href="/privacy">Privacy Policy</a>. You can export your transactions to CSV at any time. If we
        materially change how or where data is stored (for example, cloud sync), we will update the Privacy Policy
        and the in-product notices before the change applies to you.
      </p>

      <H n="8" t="Disclaimers" />
      <p>
        THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE.” TO THE MAXIMUM EXTENT PERMITTED BY LAW, TME DISCLAIMS
        ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, ACCURACY
        AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE OR PERFECTLY
        SECURE.
      </p>

      <H n="9" t="Limitation of liability" />
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW: (a) TME IS NOT LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL,
        CONSEQUENTIAL OR PUNITIVE DAMAGES, OR FOR LOST PROFITS, SAVINGS OR DATA; AND (b) TME'S TOTAL LIABILITY FOR
        ALL CLAIMS RELATING TO THE SERVICE IS CAPPED AT THE GREATER OF $50 OR THE AMOUNTS YOU PAID US IN THE TWELVE
        MONTHS BEFORE THE CLAIM. Some jurisdictions do not allow certain limitations; where that is the case, these
        limits apply to the fullest extent permitted.
      </p>

      <H n="10" t="Indemnification" />
      <p>
        You will defend and hold TME harmless from claims arising out of your misuse of the Service or violation of
        these Terms or of law, except to the extent caused by our own breach of these Terms.
      </p>

      <H n="11" t="Governing law and disputes" />
      <p>
        These Terms are governed by the laws of the State of Ohio, without regard to conflicts rules. Any dispute
        that cannot be resolved informally will be resolved by <b>binding individual arbitration</b> administered by
        the American Arbitration Association under its Consumer Arbitration Rules, pursuant to the Federal
        Arbitration Act (9 U.S.C. § 1 et seq.). <b>You and TME each waive the right to a jury trial and to
        participate in a class action.</b> Either party may instead bring an individual claim in small-claims
        court. You may opt out of arbitration by emailing us within 30 days of first accepting these Terms.
      </p>

      <H n="12" t="Changes, termination and contact" />
      <p>
        We may update these Terms; material changes will be posted here with a new effective date and, where
        required, notified in-product or by email — continued use after the effective date is acceptance. You may
        stop using the Service at any time; your local data remains on your device. Questions:{" "}
        <a href={`mailto:${LEGAL_EMAIL}`}>{LEGAL_EMAIL}</a>.
      </p>
    </LegalShell>
  );
}

/* ================================================================== *
 * PRIVACY POLICY
 * ================================================================== */
export function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy">
      <p>
        This policy explains exactly what data BudgetSmart handles, where it lives, and your rights. It is written
        to comply with the Gramm-Leach-Bliley Act (15 U.S.C. §§ 6801–6809) and the FTC Safeguards Rule
        (16 C.F.R. Part 314), the CCPA/CPRA (Cal. Civ. Code § 1798.100 et seq.), the Virginia CDPA
        (Va. Code § 59.1-575 et seq.), the Colorado Privacy Act (C.R.S. § 6-1-1301 et seq.), the EU/UK GDPR
        (Regulation (EU) 2016/679) where applicable, COPPA (15 U.S.C. §§ 6501–6506), and Ohio law (Ohio Rev. Code
        Ch. 1354 and § 1349.19).
      </p>

      <H n="1" t="The headline: your money data stays on your device" />
      <p>
        The BudgetSmart app is local-first. Your transactions, budgets, goals, debts and notes are stored in a
        database on your own device and are usable fully offline. We cannot see them. The only data that leaves
        your device is listed in Section 2 — each item exists to power a feature you can see, and the optional ones
        are off until you turn them on.
      </p>

      <H n="2" t="What we collect and why" />
      <ul>
        <li><b>Account data</b> — email, name, hashed password (or Google sign-in identifier), locale, theme,
          subscription tier, trial status. Purpose: sign-in and unlocking the plan you paid for.</li>
        <li><b>Billing data</b> — handled by our payment processor (Stripe). We receive subscription status and a
          customer reference, <b>never full card numbers</b>.</li>
        <li><b>Order data</b> (Custom/Enterprise) — contact name, email, seat count, chosen features, quoted price,
          and order status. Purpose: fulfilling your order and issuing your redemption code.</li>
        <li><b>Email recap numbers</b> (optional, off by default) — if you enable monthly/weekly recaps, the app
          sends the summary totals (income, spending, category totals) so we can email them to you. Not your
          transactions.</li>
        <li><b>Shared-plan snapshots</b> (optional; shared plans only) — headline numbers (net worth, cashflow,
          budget/goal status) shown to your plan owner on the Master view. Never individual transactions,
          merchants or notes.</li>
        <li><b>Market symbols</b> — the app requests prices for ticker symbols you track. The request contains
          symbols, not your identity or quantities held.</li>
        <li><b>Operational logs</b> — our servers keep short-lived technical logs (timestamps, endpoints, status
          codes) for security and reliability. We run no advertising trackers and no third-party analytics on the
          app or site.</li>
        <li><b>Security / abuse evidence</b> — when we detect an attack or abuse (e.g. brute-force attempts,
          scanning, or a sign-in from a new location), we log the <b>source IP address and network attribution</b>
          (ISP, approximate geolocation, user-agent) alongside the event. Our lawful basis is our legitimate
          interest in protecting the Service and your accounts (and, under GDPR Art. 6(1)(f), fraud prevention and
          network security). This evidence may be retained and, where appropriate, referred to law enforcement.
          It is <b>not</b> collected for ordinary, non-abusive use.</li>
      </ul>

      <H n="3" t="What we never do" />
      <p>
        We do not sell or rent personal information, and we do not “share” it for cross-context behavioral
        advertising as defined by the CPRA. No data broker feeds. No ad SDKs.
      </p>

      <H n="4" t="Service providers" />
      <p>
        We use a small set of processors bound to process data only on our instructions: Stripe (payments),
        Cloudflare (hosting, storage and delivery), Google (optional sign-in via OAuth), and Gmail (transactional
        email delivery). Each maintains its own published security and compliance programs.
      </p>

      <H n="5" t="Security" />
      <p>
        Data in transit is encrypted (TLS). Passwords are stored only as salted hashes. Entitlements are
        cryptographically signed. Access to production systems is restricted and logged. Our program is modeled on
        the NIST Cybersecurity Framework 2.0 and ISO/IEC 27001:2022 (certification in progress, not yet claimed).
        No system is perfectly secure — see the Terms, Section 3, for account-security responsibilities.
      </p>

      <H n="6" t="Retention" />
      <p>
        Local app data stays on your device until you delete it. Account records are kept while your account is
        active and for a reasonable period after closure for legal, tax and audit purposes; order records are kept
        as required by tax law. You may request deletion at any time (Section 8).
      </p>

      <H n="7" t="Breach notification" />
      <p>
        If a breach affects your personal information, we will notify you and regulators as required by Ohio Rev.
        Code § 1349.19, other applicable state breach laws, and (where applicable) GDPR Articles 33–34 within their
        prescribed timelines.
      </p>

      <H n="8" t="Your rights" />
      <p>
        Depending on where you live, you may have rights to access, correct, delete, and port your data, and to
        object to or restrict certain processing (CCPA/CPRA; Virginia CDPA; Colorado CPA; GDPR Arts. 15–22). Email{" "}
        <a href={`mailto:${LEGAL_EMAIL}`}>{LEGAL_EMAIL}</a> from your account email and we will verify and respond
        within the statutory window (45 days under CCPA; one month under GDPR). We do not discriminate against you
        for exercising rights. Handy self-serve versions: export your transactions any time (Settings → Export
        CSV), and uninstalling the app leaves — or you may first delete — your on-device data.
      </p>

      <H n="9" t="Children" />
      <p>
        The Service is not directed to children under 13, and we do not knowingly collect their data (COPPA,
        15 U.S.C. §§ 6501–6506). Family plans are managed by adults; wallets for minors are records kept by the
        account-holding adult.
      </p>

      <H n="10" t="International users" />
      <p>
        We are a U.S. (Ohio) company and process account data in the United States. If you use the Service from the
        EEA/UK, our legal bases under GDPR Art. 6 are contract performance (running your account), legitimate
        interests (security, service improvement), and consent (optional features like email recaps).
      </p>

      <H n="11" t="Changes and contact" />
      <p>
        Material changes will be posted here with a new effective date and notified where required. Questions or
        rights requests: <a href={`mailto:${LEGAL_EMAIL}`}>{LEGAL_EMAIL}</a> — Tech Myriad Emporium LLC, an Ohio
        limited liability company operating online.
      </p>
    </LegalShell>
  );
}
