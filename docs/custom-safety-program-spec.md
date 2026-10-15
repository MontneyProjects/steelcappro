# Custom Safety Program — spec from Leland (saved 2026-10-15)

> STATUS: Not started. Next step is the plan he asked for (inspect codebase, data model, user flow, security/payment/versioning/AI concerns, implementation plan). No code until he approves the plan.

I want to add a new paid feature to STEELCAP PRO called:

CUSTOM SAFETY PROGRAM
Price: $199 CAD one-time

CONTEXT

Steelcap Pro is an operations app for small oilfield/service contractors, initially focused on Western Canada. Its three core pillars are:

1. Safety
2. Dispatch
3. Bookkeeping / QuickBooks integration

This new feature belongs inside the Safety pillar.

The goal is to allow a small contractor to answer a guided questionnaire and have Steelcap Pro generate a professional, company-specific safety program based on:

- Their province/jurisdiction
- Their industry
- Their actual work activities
- Their equipment
- Their crew
- Their hazards/exposures
- Their company information

The final safety program should be branded with the customer's company name and logo and be available inside Steelcap Pro as well as downloadable as a professional PDF.

IMPORTANT PRODUCT PRINCIPLE

This must NOT feel like:
"Ask AI to write me a safety manual."

It should feel like a legitimate professional Steelcap product:

Company questionnaire
→ determine applicable requirements/topics
→ use controlled/vetted safety content
→ customize it to the company
→ generate program
→ owner reviews it
→ owner formally adopts it
→ workers can access it in Steelcap
→ revisions and acknowledgements are tracked.

The AI should never invent legislation, regulatory citations, requirements or safety standards.

ARCHITECTURE

Design this so Steelcap can eventually maintain a version-controlled safety content library for each supported jurisdiction.

The generated program should be assembled/customized from this controlled content plus company-specific information.

Keep the AI generation layer separate from the authoritative safety/compliance content layer.

We need to be able to update the underlying safety content later without rebuilding the entire feature.

SUPPORTED JURISDICTIONS AT LAUNCH

Design the architecture for:
- Alberta
- British Columbia

Do not hard-code the system so that only these two provinces can ever exist. We need to add additional Canadian jurisdictions later.

ENTRY POINT

Inside:

Safety → Safety Program

If the company does not have a program yet, show a premium card:

CUSTOM SAFETY PROGRAM
Built for your company.

Answer a few questions about your operation and Steelcap will build a professional safety program specific to your company, jurisdiction and work activities.

$199 CAD · One-time

[Build my safety program]

Below this, briefly show:

✓ Customized to your operation
✓ Company branding
✓ Policies and procedures
✓ Safe work practices
✓ Downloadable PDF
✓ Available to your crew in Steelcap
✓ Version and acknowledgement tracking

Do not make this page look like an ecommerce store. It should feel like a premium feature within the existing Steelcap product.

SETUP FLOW

Build a clean multi-step wizard.

STEP 1 — YOUR COMPANY

Collect:
- Legal company name
- Operating/trade name
- Province(s) of operation
- Address
- Primary contact
- Approximate number of workers
- Company logo
- Industry/category

Prefill anything Steelcap already knows about the company.

Never make the owner enter information we already have.

STEP 2 — WHAT KIND OF WORK DO YOU DO?

Use large multi-select cards/checklists.

Initial categories should include:

- Oilfield service
- Facility construction
- Pipefitting
- Welding
- Picker / boom truck operations
- Lifting and rigging
- Trucking / hauling
- Equipment operation
- Excavation / ground disturbance
- Working at heights
- Confined space
- Hot work
- Pressure equipment / piping
- Working alone
- Shop / yard work
- Other

Allow "Other" with a description field.

STEP 3 — YOUR EQUIPMENT

Ask what equipment they operate.

Examples:
- Pickup trucks
- Picker / boom trucks
- Skid steers
- Excavators
- Trailers
- Welding equipment
- Aerial work platforms
- Forklifts
- Other

Where relevant, reuse equipment already stored in Steelcap.

STEP 4 — HAZARDS & EXPOSURES

Present a practical multi-select list based partly on the work selected in Step 2.

Examples:
- Driving
- Mobile equipment
- Suspended loads
- Pinch points
- Stored energy
- Working at heights
- Hot work
- H2S
- Hazardous products / WHMIS
- Extreme weather
- Noise
- Manual handling
- Ground disturbance
- Confined spaces
- Pressure
- Working alone
- Fatigue
- Other

The system can recommend hazards based on their selected work, but the owner must be able to add/remove selections.

STEP 5 — REVIEW

Show a clean summary:

YOUR SAFETY PROGRAM

Jurisdiction:
Alberta

Workers:
8

Work activities:
Picker operations
Pipefitting
Facility construction
Welding

Equipment:
Picker trucks
Pickup trucks
Skid steers

Key exposures:
H2S
Suspended loads
Hot work
Driving
Working at heights

Allow editing before purchase/generation.

PURCHASE

Display:

CUSTOM SAFETY PROGRAM
$199 CAD
One-time purchase

Then show the following concise statement:

"Your safety program will be generated using the company, jurisdiction and work information you provided."

Include the required acknowledgement:

"I understand that Steelcap Pro provides a safety program based on the information supplied and the requirements/content available for the selected jurisdiction and work activities. My company remains responsible for reviewing, implementing and maintaining its safety program, providing required training, addressing site-specific hazards, and ensuring ongoing compliance with applicable legislation, regulations and client requirements."

Require the checkbox before purchase.

Store:
- User who accepted
- Date/time
- Disclaimer version
- Program jurisdiction
- Questionnaire version
- Questionnaire responses

Do not allow generation until acknowledgement and successful payment are complete.

PROGRAM GENERATION

After payment:

Show a proper generation state rather than a generic spinner.

Example:

BUILDING YOUR SAFETY PROGRAM

✓ Company information
✓ Jurisdiction
✓ Work activities
✓ Equipment & hazards
● Building policies and procedures
○ Preparing your document

"This may take a few minutes. You can leave this screen."

Generation should happen server-side and survive the user closing the app.

FINAL SAFETY PROGRAM

Create a professionally structured safety program.

It should be capable of containing applicable sections such as:

- Company safety policy
- Management responsibilities
- Supervisor responsibilities
- Worker responsibilities
- Hazard identification and assessment
- FLHA / field-level hazard assessment process
- Worker training and competency
- PPE
- Inspections
- Preventive maintenance
- Incident and near-miss reporting
- Incident investigation
- Emergency preparedness and response
- First aid
- Working alone
- Driving
- Mobile equipment
- Lifting and rigging
- Picker / boom truck operations
- Hot work
- Welding
- Working at heights
- Hazardous products / WHMIS
- H2S
- Ground disturbance
- Confined space
- Lockout / energy isolation
- Housekeeping
- Environmental considerations
- Contractor/subcontractor expectations
- Safety meetings / Toolbox Talks
- Records and documentation
- Program review
- Applicable safe work practices
- Applicable safe job procedures

IMPORTANT:

Do NOT blindly include every section.

The final program should reflect the company's questionnaire responses and applicable controlled safety content.

Do not invent regulatory requirements or legal citations.

If authoritative content required for a particular jurisdiction/activity is unavailable or uncertain, flag that section for review rather than generating unsupported compliance claims.

BRANDING

Generate a professional cover:

[COMPANY LOGO]

COMPANY NAME

HEALTH & SAFETY PROGRAM

Prepared with Steelcap Pro
Effective date
Version number

The PDF should look like a professionally prepared corporate safety manual, not an AI-generated document.

Use the customer's logo and selected company accent colour where appropriate.

Keep typography, tables, headers, footers and page numbering consistent.

STEELCAP SAFETY LIBRARY

After generation, Safety → Safety Program should become a dashboard.

Show:

HEALTH & SAFETY PROGRAM
Version 1.0
Effective: [date]
Status: Awaiting adoption / Active / Update available

Actions:
[View program]
[Download PDF]
[Adopt program]
[Share with crew]

Also show:

Policies
Safe Work Practices
Safe Job Procedures
Emergency Procedures
Forms
Revision History
Worker Acknowledgements

ADOPTION

Generation and adoption are separate actions.

The owner/admin must review the program and then select:

[Adopt Safety Program]

Confirmation screen:

ADOPT SAFETY PROGRAM

By adopting this program, you confirm that you have reviewed it and are implementing it as your company's health and safety program.

Name
Title
Effective date

[Adopt program]

Store this as an auditable event.

WORKER EXPERIENCE

Once adopted, workers should have:

Safety → Safety Program

They can:
- Read the program
- Search it
- Open individual policies/procedures
- See new/revised documents
- Acknowledge documents when required

Do not expose administrative controls to normal crew users.

AI INTEGRATION

The existing "Ask Steelcap Pro" assistant should eventually be able to answer questions using the company's ADOPTED safety program.

Examples:

"What does our safety program say about suspended loads?"

"What's our procedure for working alone?"

"What PPE do we require for grinding?"

"Show me our picker inspection requirements."

IMPORTANT:

Answers about the company's safety program should be grounded in the company's actual adopted documents.

Where possible, show:
"Source: Lifting & Rigging Procedure — Section 6.2"

The AI must distinguish between:
1. What the company's adopted safety program says
2. General informational guidance

Never present general AI knowledge as though it came from the company's adopted program.

PROGRAM UPDATES

Design the data model so that later we can support:

"Your operation has changed."

Example:
The company adds picker/boom truck operations.

Steelcap can detect that their current program may not address the new activity and show:

SAFETY PROGRAM UPDATE RECOMMENDED

"You added picker truck operations. Your current safety program may need additional policies and procedures."

[Review recommended updates]

Do NOT automatically change an adopted safety program.

Generate a proposed new version.

Owner reviews changes → adopts Version 1.1 → previous Version 1.0 remains archived.

COMPLIANCE / PRODUCT LANGUAGE

Do not use claims like:

"Guaranteed compliant"
"Legally approved"
"Government approved"
"100% compliant"

Product copy may say things such as:

"Customized for your company and operations."

"Built using Steelcap's jurisdiction and industry safety framework."

"Designed to help companies build and maintain a comprehensive safety program."

Any stronger compliance language must come from approved product/legal copy, not be invented by the application or AI.

TECHNICAL REQUIREMENTS

Build this as a reusable system, not a one-off Alberta oilfield PDF generator.

We need structured entities for:
- Jurisdictions
- Safety content modules
- Content/module versions
- Applicability rules
- Questionnaire versions
- Company responses
- Generated programs
- Program sections
- Program versions
- Adoption records
- Worker acknowledgements
- Disclaimer versions
- Payments
- Generation jobs

Preserve historical program versions.

Never overwrite an adopted program.

Any regenerated/updated program creates a new version.

Use role-based permissions:
- Owner/Admin: purchase, generate, review, adopt, update, download
- Crew: read and acknowledge only

DESIGN

Use the existing Steelcap Pro design system.

Dark premium UI:
#0B0E10 background
#1F262C cards
#E9ECEF primary text
#A9B2BA secondary
#00C2B2 default Steelcap accent

Large tap targets.
Very little clutter.
Plain English.
Mobile-first.
Designed for contractors, not safety professionals.

Do not redesign unrelated areas of the application.

IMPLEMENTATION APPROACH

Before writing code:

1. Inspect the existing Steelcap Pro codebase.
2. Identify the existing Safety architecture, authentication/roles, company model, branding system, storage, PDF generation capability, payment infrastructure and AI infrastructure.
3. Identify what can be reused.
4. Propose the database/data-model additions.
5. Propose the complete user flow.
6. Identify any security, payment, document-versioning or AI-generation concerns.
7. Show me the implementation plan.

Do not begin making large architectural changes until you have shown me that plan.

Most importantly: build this as a real commercial Steelcap feature, not a demo AI document generator.