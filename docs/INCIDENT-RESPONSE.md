# Personal data breach response plan

Use this when personal data may have been lost, stolen, exposed or changed without permission. Examples: a lost or stolen front-desk laptop, a backup file sent to the wrong person, a staff account used by someone else, or a suspected hack.

> Not legal advice. Confirm current requirements with the National Privacy Commission (privacy.gov.ph) and your lawyer.

## Roles

| Role | Who | Responsibility |
|---|---|---|
| Incident lead | Data Protection Officer (DPO) | Coordinates the response and decides whether to notify |
| Technical lead | Admin / IT contact | Contains the breach and preserves evidence |
| Owner / management | Gym owner | Approves notifications and talks to the public |

## Step 1 · Contain (first hour)

- Change the passwords of affected staff accounts (Settings → Staff accounts → Reset password), and issue new temporary PINs to affected members (Members → Edit → Issue temporary PIN).
- Sign out every session: signing out in one tab signs out all tabs on that device. On a production backend, revoke sessions server-side.
- Disconnect a compromised device from the network, and don't wipe it yet.
- Recover misdirected files if you can. Ask the recipient in writing to delete them and confirm.

## Step 2 · Assess (within 24 hours)

Write down:

1. What happened, and when it was discovered.
2. Which data was involved: names, contact info, **health data** (sensitive), payments, credentials.
3. How many people are affected.
4. Whether the data was encrypted or hashed. Passwords and PINs are hashed, but health answers are not.
5. The likely harm: identity fraud, discrimination, embarrassment, or financial loss.

Use the **Activity log** (Settings → Activity log) to trace who did what, and export a backup for evidence.

## Step 3 · Notify (within 72 hours of knowledge, when required)

Under NPC rules, you must notify the **NPC** and the **affected people** within 72 hours when a breach:

- involves sensitive personal information (e.g. health data) or information that could enable identity fraud, **and**
- is reasonably believed to have been acquired by an unauthorised person, **and**
- is likely to cause a real risk of serious harm.

When in doubt, consult your lawyer quickly. The 72-hour clock keeps running while you decide.

A notification should include what happened, the data involved, what you've done about it, what the person can do to protect themselves, and the DPO's contact details.

If a crime is involved, such as hacking or theft, you may also report to the PNP Anti-Cybercrime Group or the NBI Cybercrime Division.

## Step 4 · Recover and learn

- Fix the root cause (e.g. enable MFA, train staff, encrypt backups).
- Record the incident in a breach register, even if you didn't have to notify anyone.
- Review this plan once a year and after every incident.

## Breach register template

| Date found | What happened | Data / people affected | Notified NPC? | Notified people? | Actions taken | Closed |
|---|---|---|---|---|---|---|
| | | | | | | |
