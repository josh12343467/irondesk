import type { Settings } from '../types';

/**
 * Legal templates for a gym operating in the Philippines.
 *
 * ⚠️ TEMPLATES ONLY, NOT LEGAL ADVICE. They are written to follow the general structure required by
 * the Data Privacy Act of 2012 (RA 10173), its IRR and NPC circulars, and the Consumer Act (RA 7394),
 * but a Philippine lawyer must review and adapt them before a real business relies on them.
 *
 * Bump LEGAL_VERSION whenever the wording changes so consent records show which version a member accepted.
 */
export const LEGAL_VERSION = '2026-11-19';

/** Pre-exercise health screening (our own wording, modelled on common pre-participation screening). */
export const HEALTH_QUESTIONS = [
  'Has a doctor ever told you that you have a heart condition or high blood pressure?',
  'Do you feel chest pain at rest, during daily activities, or when you exercise?',
  'In the past 12 months, have you lost your balance because of dizziness, or lost consciousness?',
  'Have you been diagnosed with another chronic condition (e.g. diabetes, asthma, epilepsy)?',
  'Are you currently taking prescription medication for a chronic condition?',
  'Do you have a bone, joint, or soft-tissue problem that could get worse with physical activity?',
  'Are you pregnant, or have you given birth in the last 6 months?',
];

export type LegalDocKey = 'privacy' | 'terms' | 'waiver';

export interface LegalSection {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
}

export interface LegalDoc {
  title: string;
  summary: string;
  sections: LegalSection[];
}

const ph = (v: string | undefined, placeholder: string) => (v && v.trim() ? v.trim() : `[${placeholder}]`);

export function legalDoc(key: LegalDocKey, s: Settings): LegalDoc {
  const gym = ph(s.legalName, 'Registered business name') + (s.legalName ? '' : ` (operating as ${s.gymName})`);
  const address = ph(s.address, 'Business address');
  const dpo = `${ph(s.dpoName, 'Data Protection Officer name')} · ${ph(s.dpoEmail, 'dpo@yourgym.ph')}`;
  const retention = s.retentionMonths ?? 24;

  if (key === 'privacy') {
    return {
      title: 'Privacy Notice',
      summary: `How ${s.gymName} collects, uses, protects and keeps your personal data, and your rights under the Data Privacy Act of 2012 (RA 10173).`,
      sections: [
        {
          heading: '1. Who we are',
          paragraphs: [
            `${gym}, ${address}, is the personal information controller for the data described here.`,
            `Data Protection Officer (DPO): ${dpo}. Contact the DPO for any privacy question or request.`,
          ],
        },
        {
          heading: '2. What we collect',
          bullets: [
            'Identity and contact: full name, mobile number, email, birth date, and parent/guardian name for minors.',
            'Membership and payments: plan, start and expiry dates, amounts paid, payment method, and receipts.',
            'Attendance: check-in date and time, class bookings.',
            'Health information (sensitive personal information): your answers to the pre-exercise health screening, height, weight and BMI entries you choose to log.',
            'Account and security data: your portal PIN (stored only as a salted one-way hash, never in plain text), sign-in attempts, and an audit log of actions taken on your record.',
          ],
        },
        {
          heading: '3. Why we use it, and our legal basis',
          bullets: [
            'To register you, manage your membership, verify entry and take bookings: necessary to fulfil our membership contract with you.',
            'To keep financial records and issue receipts: compliance with legal obligations (e.g. tax rules).',
            'To screen health risks before exercise and keep progress records: your consent, because this is sensitive personal information.',
            'To protect members, staff and our systems (audit logs, sign-in protection): our legitimate interest in security.',
            'To send promotions and gym news: only if you opt in. You can withdraw any time.',
          ],
        },
        {
          heading: '4. Who can see your data',
          paragraphs: [
            'Access is role-based. Front-desk staff see what they need to check you in, take payments and book classes. Only administrators see full health answers, reports and audit logs. You can see your own data in the member portal.',
            'We do not sell your personal data. We share it only with service providers who process it for us under a written agreement (e.g. hosting, SMS), or with government authorities when required by law.',
          ],
        },
        {
          heading: '5. How long we keep it',
          bullets: [
            `Attendance records and the activity log: ${retention} months, then deleted.`,
            'Membership and contact data: while your membership is active, then for as long as needed to settle accounts or defend legal claims.',
            'Financial records: for the period required by tax and accounting rules (please confirm with your accountant).',
            'Health screening and weigh-ins: until you ask us to delete them or your account is erased.',
          ],
        },
        {
          heading: '6. How we protect it',
          bullets: [
            'Role-based access, individual staff accounts, and an audit trail of who did what.',
            'Salted password/PIN hashing, sign-in lockout after repeated failures, and automatic sign-out when idle.',
            'Restrictive browser security policies and no third-party trackers or analytics.',
            'Staff are trained on confidentiality. If a personal data breach happens, we will notify the National Privacy Commission and affected individuals as required by NPC rules.',
          ],
        },
        {
          heading: '7. Your rights',
          bullets: [
            'Be informed about how your data is processed.',
            'Access your data, and get a copy in a portable format (download it from the member portal).',
            'Correct inaccurate data.',
            'Object to processing, and withdraw consent (e.g. marketing, health data).',
            'Ask for erasure or blocking of your data.',
            'Claim damages, and file a complaint with the National Privacy Commission (privacy.gov.ph).',
          ],
          paragraphs: ['You can exercise these rights in the member portal (Profile → Privacy & data) or by contacting our DPO. We will respond within a reasonable time.'],
        },
        {
          heading: '8. Minors',
          paragraphs: ['Members below 18 may join only with the written consent of a parent or legal guardian, who exercises these rights on their behalf.'],
        },
        {
          heading: '9. Browser storage',
          paragraphs: ['This app stores data in your browser only to make it work (your session and app data). We do not use advertising or tracking cookies.'],
        },
        {
          heading: '10. Changes',
          paragraphs: [`We will post updates here and ask for your consent again when the change affects how we use sensitive data. Version ${LEGAL_VERSION}.`],
        },
      ],
    };
  }

  if (key === 'terms') {
    return {
      title: 'Membership Terms & House Rules',
      summary: `The agreement between you and ${s.gymName} when you become a member.`,
      sections: [
        {
          heading: '1. Eligibility',
          paragraphs: ['You must be at least 18 years old, or have a parent/guardian sign these terms for you. You confirm that the information you give us is true and complete.'],
        },
        {
          heading: '2. Plans, payment and renewal',
          bullets: [
            'Your membership is valid for the period of the plan you paid for. The expiry date is shown in your member portal and on your pass.',
            'Renewals are paid at the front desk. You will receive a payment acknowledgement for every payment.',
            'Prices may change, but a change never affects a period you have already paid for.',
          ],
        },
        {
          heading: '3. Refunds, freezing and transfers',
          paragraphs: [
            '[Insert the gym\'s refund, freeze and transfer policy here, e.g. medical freeze with a doctor\'s certificate.]',
            'Nothing in these terms limits your rights under the Consumer Act of the Philippines (RA 7394) or other laws that cannot be waived.',
          ],
        },
        {
          heading: '4. Your member pass and account',
          bullets: [
            'Your QR pass and portal account are personal and cannot be shared or transferred.',
            'Keep your PIN secret. Tell the front desk right away if you think someone else knows it.',
            'Staff may ask for a valid ID to confirm your identity.',
          ],
        },
        {
          heading: '5. Classes',
          bullets: [
            'Book through the member portal or the front desk. Slots are first come, first served.',
            'Please cancel if you can\'t attend so someone else can take your slot.',
            'Class schedules and trainers may change. We will try to tell you in advance.',
          ],
        },
        {
          heading: '6. House rules',
          bullets: [
            'Wear proper workout clothes and closed shoes.',
            'Wipe down equipment after use and return weights to the rack.',
            'Follow staff and trainer instructions, and ask for help with equipment you are unsure about.',
            'No harassment, discrimination, violence, or recording of other members without their consent.',
            'No alcohol, illegal drugs, or performance-enhancing substances on the premises.',
            'Minors must be supervised as required by the gym.',
            'Report any injury, accident or broken equipment to staff immediately.',
          ],
        },
        {
          heading: '7. Personal belongings',
          paragraphs: ['Use lockers for your valuables. The gym is not responsible for loss or damage to personal belongings, except when caused by the gym\'s own fault or negligence.'],
        },
        {
          heading: '8. Suspension and termination',
          paragraphs: ['We may suspend or end a membership for serious or repeated breaches of these terms, after giving you a chance to explain. Any refund will follow section 3 and the law.'],
        },
        {
          heading: '9. Governing law',
          paragraphs: [`These terms are governed by the laws of the Republic of the Philippines. Version ${LEGAL_VERSION}.`],
        },
      ],
    };
  }

  return {
    title: 'Assumption of Risk, Waiver & Health Declaration',
    summary: 'Please read carefully before you start training.',
    sections: [
      {
        heading: '1. Assumption of risk',
        paragraphs: [
          'Physical exercise, including weight training, group classes, boxing and cardio, carries a risk of injury and, in rare cases, serious harm. I take part voluntarily and accept these inherent risks.',
        ],
      },
      {
        heading: '2. Health declaration',
        bullets: [
          'I have answered the health screening questions truthfully and will tell staff if my health changes.',
          'If I answered "yes" to any question, I have been advised to get clearance from a doctor before exercising, and I take responsibility for doing so.',
          'BMI, weight tracking and trainer guidance in this app are general fitness information, not medical advice.',
        ],
      },
      {
        heading: '3. My responsibilities',
        bullets: [
          'Follow staff and trainer instructions, and use equipment only as intended.',
          'Stop exercising and tell staff right away if I feel pain, dizziness or shortness of breath.',
          'Know my limits and not train beyond what is safe for me.',
        ],
      },
      {
        heading: '4. Release',
        paragraphs: [
          `To the fullest extent allowed by Philippine law, I release ${gym} and its staff from claims for injury that result from the inherent risks of exercise.`,
          'This release does NOT cover injury caused by the gym\'s fraud, negligence, gross negligence or wilful misconduct, such as poorly maintained equipment or unqualified supervision, or any liability that the law does not allow to be waived.',
        ],
      },
      {
        heading: '5. Emergencies',
        paragraphs: ['In an emergency, I authorise staff to give first aid and to call emergency services or my emergency contact on my behalf.'],
      },
      {
        heading: '6. Minors',
        paragraphs: ['For members below 18, the parent or guardian named in the registration accepts this waiver on the member\'s behalf.'],
      },
      { heading: 'Version', paragraphs: [LEGAL_VERSION] },
    ],
  };
}
