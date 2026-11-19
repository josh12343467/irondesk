# Privacy & legal compliance guide (Philippines)

> ⚠️ **Not legal advice.** This guide summarises common obligations for a small gym in the Philippines so you know what to ask a lawyer and your accountant. Laws and regulator issuances change. Check the current text with the National Privacy Commission (NPC), BIR, DTI and your LGU, and have a Philippine lawyer review the in-app Privacy Notice, Membership Terms and Waiver before real use.

## 1. Data Privacy Act of 2012 (RA 10173)

A gym is a **personal information controller (PIC)**. It collects names, contact details and payments (personal information), plus **health information**, which the law treats as **sensitive personal information** and protects more strictly.

| Obligation | How IronDesk supports it | What you still need to do |
|---|---|---|
| **Lawful basis and consent.** Sensitive personal information generally needs specific, informed consent. | The registration form asks for separate checkboxes: Terms + Waiver, Privacy Notice + health data processing, and optional marketing. Each consent is stored with its version, timestamp and the staff member who recorded it. | Keep signed paper forms too if your lawyer recommends it. Re-collect consent when you change the documents (bump `LEGAL_VERSION`). |
| **Transparency.** Tell people what you collect, why, and for how long. | A Privacy Notice is linked from the login screen, the registration form and the member portal. | Fill in your business name, address and DPO under Settings → Privacy & compliance. Display a short privacy notice at the front desk. |
| **Proportionality / data minimisation.** | Only fields needed for membership, safety and payments. Notes warn against writing medical details. Phone numbers are masked on the check-in screen. | Don't add ID scans, photos or extra fields unless you need them and the notice covers them. |
| **Data Protection Officer (DPO).** | DPO name and email appear in the Privacy Notice. | Formally designate a DPO (can be the owner for a small gym). |
| **Data subject rights.** Information, access, objection, erasure/blocking, damages, portability, rectification, complaint to the NPC. | In the portal, members can **download their data** (JSON), **edit** their contact info, **withdraw** marketing consent, and **request** correction, objection or erasure. Admins handle requests under Settings → Privacy & compliance, and approving an erasure deletes the member's data. | Answer requests promptly and keep a record (the app keeps one). Verify identity before acting on requests made outside the portal. |
| **Retention.** Keep data only as long as necessary. | A configurable retention period with a one-click purge of old check-ins, bookings and log entries. Payments are kept de-identified for accounting. | Agree on retention periods with your accountant (financial records) and lawyer, and write them into the Privacy Notice. |
| **Security measures** (organisational, physical, technical). | See [`SECURITY.md`](../SECURITY.md): hashed credentials, lockout, idle sign-out, role-based access, audit log, CSP. | Use a real backend before going live. Train staff, use individual accounts (no shared logins), lock the front-desk PC, and keep backups encrypted. |
| **Breach management.** | The audit log helps you find out what happened. | Follow [`INCIDENT-RESPONSE.md`](INCIDENT-RESPONSE.md). Under NPC rules (NPC Circular 16-03 and later issuances), notifiable breaches must be reported to the NPC and affected people within **72 hours** of knowledge. |
| **Registration with the NPC.** | — | Check whether you must register your data processing system under NPC Circular 2022-04 (thresholds include processing sensitive personal information of 1,000 or more individuals). |
| **Outsourcing / processors.** | No third-party services are used in this demo. | If you add hosting, SMS or payment providers, sign a data sharing or outsourcing agreement and list them in the Privacy Notice. |
| **Minors.** | Birth date is required. For members below 18, the form requires a guardian's name and consent. Under 12 is blocked. | Check with your lawyer on the age policy and how to verify guardian consent. |

Penalties for unauthorised processing, especially of sensitive personal information, include **imprisonment and large fines** (Chapter VIII of RA 10173). Most of the protection comes from doing the boring things consistently.

## 2. Receipts and taxes (BIR)

- IronDesk prints a **payment acknowledgement**, not a BIR invoice or official receipt. It says so on the slip ("not valid for claim of input tax").
- Software that issues invoices or receipts needs BIR registration or a permit (e.g. CAS/CRM rules). Until you have one, issue BIR-registered invoices from your authorised booklet or system.
- Since the Ease of Paying Taxes Act (RA 11976), the **invoice** is the primary document for sales of services. Confirm with your accountant what to issue and how long to keep records.

## 3. Consumer protection (RA 7394 and DTI rules)

- State prices, plan durations, and refund, freeze and transfer rules clearly **before** payment (fill in section 3 of the Membership Terms).
- Terms cannot take away rights the law gives consumers. The template says so explicitly.
- Honour advertised promos, and don't change the price of a period that has already been paid.

## 4. Waivers and liability (Civil Code)

- A waiver helps show that members understood and accepted the **inherent** risks of exercise.
- It **does not** protect the gym from liability for its own fraud, negligence or wilful misconduct. Under the Civil Code, a waiver of future fraud is void, and courts may still hold you liable for negligence (e.g. broken equipment, unqualified supervision). The template is written to reflect this.
- What actually protects you is **operating safely**: inspect and maintain equipment and log it, use qualified trainers, put up first-aid and emergency procedures and train staff on them, post rules, and run health screening (built into registration).

## 5. Other things to check

- **Business permits:** Mayor's/business permit, BIR Certificate of Registration (Form 2303), DTI or SEC registration, sanitary and fire safety permits from your LGU.
- **Safe Spaces Act (RA 11313):** keep an anti-harassment policy (the house rules include one), and ask your lawyer whether your establishment must post signage or designate someone to receive complaints.
- **CCTV:** if you record video, put up visible signage and cover it in the Privacy Notice, following NPC guidance on CCTV.
- **Marketing messages:** send promos only to members who opted in (the app tracks this), and include an opt-out.
- **Open-source licences:** keep `LICENSE` and the dependencies' licence notices when you distribute the app.

## 6. Go-live checklist

- [ ] A lawyer has reviewed the Privacy Notice, Membership Terms and Waiver, and `LEGAL_VERSION` is updated.
- [ ] Business name, address and DPO are filled in (Settings → Privacy & compliance).
- [ ] Refund, freeze and transfer policy is written into the Membership Terms.
- [ ] NPC registration requirement is checked.
- [ ] Production backend is in place (see `SECURITY.md`).
- [ ] Staff are trained on privacy, using individual accounts, and know the incident-response steps.
- [ ] BIR invoicing is set up separately from IronDesk acknowledgements.
- [ ] Retention periods are agreed with your accountant and lawyer.
