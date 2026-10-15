# Builds /privacy/index.html and /terms/index.html from the text below.
# Run from the repo root: python3 site-src/legal.py
import html, os, re

UPDATED = "October 15, 2026"
CONTACT = "general@montneyprojects.com"

PRIVACY = f"""
# Privacy Policy
_Last updated: {UPDATED}_

Steelcap Pro is operated by 2619681 Alberta Ltd. ("Steelcap Pro", "we", "us"). This policy explains what information we collect when you use the Steelcap Pro app and website at steelcappro.com, how we use it, and the choices you have. We wrote it in plain language. If anything is unclear, email us at {CONTACT}.

## Who this applies to
Steelcap Pro is used by companies ("Customers") and the people they invite, such as owners, office staff, foremen and crew ("Users"). A Customer controls the information its crew enters into its company account. We store and process that information on the Customer's behalf to run the service.

## What we collect
**Account information.** Name, email address, phone number, role, and your password (stored encrypted, we never see it in plain text).

**Company information.** Company name, logo, colours, pay schedule, trucks and equipment, clients, billing rates, and invite codes.

**Work records you enter.** Field tickets, hours, job sites and legal land descriptions, safety forms (pre-trip inspections, FLHAs, toolbox meetings and others), defects, signatures, photos you attach, dispatches, fuel logs, expenses and receipt photos, certificates, and crew chat messages.

**Accounting connection.** If a Customer connects QuickBooks Online, we store the connection tokens Intuit gives us and the records we need to sync, such as customer and employee names and the IDs of invoices, expenses and timesheets we create. If a Customer chooses Google Sheets or Excel instead, we create the export or feed the Customer asks for.

**Device and usage information.** Basic technical data our hosting providers log automatically, such as IP address, browser and device type, and the date and time of requests. If you turn on notifications, we store a push token for your device so we can send you dispatches and messages.

**Analytics.** Our website and app use Google Analytics to count visits and see which pages and features get used. It records things like pages viewed, device type, and approximate location (city or region, based on IP address), using cookies or similar storage. We use this only to understand and improve Steelcap Pro, not to show you ads. You can block it with your browser's privacy settings or Google's opt-out add-on.

We do not collect your precise location in the background, and we do not sell your information to advertisers.

## How we use it
- To run the app: show your company's records to the right people, send dispatches and notifications, and produce exports.
- To connect your books: create draft invoices, expenses and timesheets in your QuickBooks account when you tell the app to.
- To power optional AI features: when you use the assistant or scan a receipt, the text or image you submit is sent to an AI service provider to produce the answer. It is not used to train their models under our agreements with them.
- To keep the service secure, fix problems and improve features.
- To contact you about your account, billing and important changes.

We do not sell personal information, and we do not use QuickBooks data for any purpose other than providing the features the Customer turns on.

## Who we share it with
- **Inside your company.** Owners and admins of your company account can see the records crew members enter for that company. Crew see what their role allows.
- **Service providers** that host and run Steelcap Pro for us, such as cloud database and file storage, website hosting, website analytics (Google Analytics), email and push-notification delivery, payment processing and AI providers. They may only use the information to provide their service to us.
- **Intuit (QuickBooks) or Google**, only when a Customer connects them, and only the records needed to do what the Customer asked.
- **When the law requires it**, or to protect the rights, safety and property of our users or the public.
- **If our business is sold or merged**, the information would transfer to the new owner under this policy.

## Where it is stored
Our service providers store data on servers in Canada and the United States. Information stored outside your province or country may be subject to the laws of that place.

## How long we keep it
We keep a Customer's records for as long as the company account is active. If a Customer closes its account, we delete or anonymize its records within 90 days, except where we need to keep something longer for legal, tax or dispute reasons. Customers should export any records they are required to keep, such as safety documentation, before closing an account.

## Your choices and rights
You can view and update your profile in the app. You can ask us for a copy of your personal information, ask us to correct it, or ask us to delete your account by emailing {CONTACT}. Because your company controls its work records, some requests (for example, deleting a signed safety form) may need your employer's approval. You can turn off notifications in your device settings at any time.

Depending on where you live, you may have additional rights under laws such as Canada's PIPEDA, Alberta's or British Columbia's Personal Information Protection Acts, or US state privacy laws. We will respond to requests as those laws require.

## Security
We use encryption in transit, encrypted password storage, and access rules that keep each company's records separate from every other company. No system is perfectly secure, so please use a strong password and keep your device locked.

## Children
Steelcap Pro is a work tool and is not meant for anyone under 16.

## Changes to this policy
If we make important changes, we will update the date at the top and let account owners know by email or in the app.

## Contact
2619681 Alberta Ltd. (Steelcap Pro)
101-10601 82 Ave, Clairmont, AB T8X 5G9, Canada
Questions or requests: {CONTACT}
"""

TERMS = f"""
# Terms of Service
_Last updated: {UPDATED}_

Steelcap Pro is operated by 2619681 Alberta Ltd. ("Steelcap Pro", "we", "us"). These terms are the agreement between your company and us for using the Steelcap Pro app and website. By creating an account or using the app, you agree to them. If you are signing up for a company, you confirm you are allowed to accept these terms for it.

## The service
Steelcap Pro is software for running field crews: safety forms, field tickets, dispatch, crew chat, fuel and expense tracking, and sending records to accounting tools such as QuickBooks Online, Google Sheets or Excel. We may add, change or remove features over time.

## Accounts
- The person who creates a company account is its owner and is responsible for who they invite and what roles they give.
- Keep your login private. You are responsible for activity under your account.
- Give us accurate information and keep it up to date.

## Your data
Your company owns the records it puts into Steelcap Pro. You give us permission to store, process and display them only as needed to provide the service. Our [Privacy Policy](/privacy/) explains how we handle personal information. You can export your records at any time while your account is active.

## Safety forms and legal compliance
Steelcap Pro provides tools and templates to help you document safety work. It does not replace your safety program, your own judgement, a qualified safety professional, or the occupational health and safety laws that apply to your work. You are responsible for making sure your forms, procedures and records meet the requirements of your province, state, clients and regulators.

## Accounting connections
When you connect QuickBooks Online or another tool, Steelcap Pro creates records in that account only when you tell it to. Records such as invoices and timesheets are created as drafts or unsent items for you to review. You are responsible for checking them before sending invoices, running payroll or filing taxes. Your use of QuickBooks, Google or Microsoft products is also covered by their own terms.

## AI features
AI answers and receipt scans can be wrong. Check them before relying on them for billing, payroll, safety or legal decisions.

## Acceptable use
Do not use Steelcap Pro to break the law, upload content you have no right to share, harass anyone, try to access another company's data, interfere with the service, or resell it without our written permission.

## Fees and billing
Paid plans are billed in advance on a monthly basis at the price shown on our website when you sign up, plus applicable taxes (such as GST). New companies get a 7-day free trial; if you do not cancel before it ends, your plan starts and your card is charged. Unless you cancel, your plan renews automatically. You can cancel at any time and keep access until the end of the period you paid for. Fees already paid are not refunded except where the law requires. We will give at least 30 days' notice before a price change affects you. If a payment fails, we may limit the account until it is paid.

## Free trials and demos
Trial and demo accounts may be limited, and demo companies are deleted automatically. Do not put real records in a demo company.

## Availability
We work to keep Steelcap Pro running, but it is provided "as is" and "as available". We do not promise it will be uninterrupted or error-free. Keep your own copies of records you are legally required to keep.

## Limitation of liability
To the extent the law allows, Steelcap Pro is not liable for indirect, incidental, special or consequential losses, lost profits, lost data or business interruption. Our total liability for any claim is limited to the fees you paid us in the 12 months before the claim.

## Ending the agreement
You can close your account at any time. We may suspend or close an account that breaks these terms or does not pay, and will give notice where reasonable. After closing, we handle your records as described in the Privacy Policy.

## Changes to these terms
If we make important changes, we will update the date at the top and tell account owners by email or in the app. Continuing to use Steelcap Pro after a change means you accept it.

## Governing law
These terms are governed by the laws of the Province of Alberta and the federal laws of Canada that apply there.

## Contact
2619681 Alberta Ltd. (Steelcap Pro)
101-10601 82 Ave, Clairmont, AB T8X 5G9, Canada
{CONTACT}
"""

def md(text):
    out, in_list = [], False
    def inline(s):
        s = html.escape(s, quote=False)
        s = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s)
        s = re.sub(r"\[(.+?)\]\((.+?)\)", r'<a href="\2">\1</a>', s)
        s = re.sub(r"(?<![\w/])_(.+?)_(?!\w)", r"<em>\1</em>", s)
        s = s.replace(CONTACT, f'<a href="mailto:{CONTACT}">{CONTACT}</a>')
        return s
    for line in text.strip().split("\n"):
        if line.startswith("- "):
            if not in_list: out.append("<ul>"); in_list = True
            out.append(f"<li>{inline(line[2:])}</li>"); continue
        if in_list: out.append("</ul>"); in_list = False
        if line.startswith("# "): out.append(f"<h1>{inline(line[2:])}</h1>")
        elif line.startswith("## "): out.append(f"<h2>{inline(line[3:])}</h2>")
        elif line.strip(): out.append(f"<p>{inline(line)}</p>")
    if in_list: out.append("</ul>")
    return "\n".join(out)

PAGE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<script async src="https://www.googletagmanager.com/gtag/js?id=G-6CR29NN6GY"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){{dataLayer.push(arguments);}}gtag('js',new Date());gtag('config','G-6CR29NN6GY');</script>
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title} | Steelcap Pro</title>
<meta name="description" content="{title} for Steelcap Pro.">
<link rel="canonical" href="https://steelcappro.com/{slug}/">
<link rel="icon" type="image/png" href="/favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&display=swap" rel="stylesheet">
<style>
:root{{--night:#0E1316;--rig:#161D21;--steel:#8B979F;--snow:#EEF1F2;--teal:#00C2B2;--line:#26313A}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--night);color:var(--snow);font-family:"Archivo",system-ui,sans-serif;font-size:17px;line-height:1.6;-webkit-font-smoothing:antialiased}}
a{{color:var(--teal)}}
.top{{border-bottom:1px solid var(--line)}}
.wrap{{max-width:760px;margin:0 auto;padding:0 20px}}
.top .wrap{{display:flex;justify-content:space-between;align-items:center;height:64px}}
.brand{{display:flex;gap:10px;align-items:center;color:var(--snow);text-decoration:none;font-weight:800}}
.brand img{{width:26px;height:26px}}
main{{padding:40px 0 70px}}
h1{{font-size:clamp(32px,6vw,46px);line-height:1.05;margin:0 0 6px;font-weight:900;font-variation-settings:"wdth" 115}}
h2{{font-size:21px;margin:34px 0 8px;font-weight:800}}
p,li{{color:#D3DADE}} em{{color:var(--steel);font-style:normal}}
ul{{padding-left:22px}} li{{margin:6px 0}}
footer{{border-top:1px solid var(--line);padding:24px 0 40px;color:var(--steel);font-size:14px}}
footer .wrap{{display:flex;gap:18px;flex-wrap:wrap}}
footer a{{color:var(--steel)}}
</style></head><body>
<header class="top"><div class="wrap"><a class="brand" href="/"><img src="/mark.png" alt="">Steelcap Pro</a><a href="/app/">Sign in</a></div></header>
<main><div class="wrap">
{body}
</div></main>
<footer><div class="wrap"><span>© 2026 2619681 Alberta Ltd. (Steelcap Pro)</span><a href="/privacy/">Privacy</a><a href="/terms/">Terms</a><a href="mailto:{contact}">Contact</a></div></footer>
</body></html>
"""

for slug, title, text in [("privacy", "Privacy Policy", PRIVACY), ("terms", "Terms of Service", TERMS)]:
    os.makedirs(slug, exist_ok=True)
    open(f"{slug}/index.html", "w").write(PAGE.format(title=title, slug=slug, body=md(text), contact=CONTACT))
    print("wrote", slug)
