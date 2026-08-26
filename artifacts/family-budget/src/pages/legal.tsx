import { useEffect } from "react";
import { Link } from "wouter";

type LegalPageKind = "privacy" | "terms";

const pageContent = {
  privacy: {
    title: "Privacy Policy",
    description:
      "How Jamvi collects, uses, stores, and protects information when you use the budgeting service.",
    intro:
      "Jamvi helps people manage personal budgets and work together in shared budgets. This Privacy Policy explains the information we handle when you use Jamvi.",
    sections: [
      {
        heading: "Information we collect",
        paragraphs: [
          "When you sign in, Jamvi receives basic account information from Google, such as your name, email address, and profile image. We use this information to create and secure your Jamvi account.",
          "You may also provide budget information, including income, expenses, savings goals, bank activity, workspace details, member names, invitations, and uploaded workspace or profile photos.",
          "We collect limited technical information needed to keep Jamvi working, such as session identifiers, browser information, security events, and service logs.",
        ],
      },
      {
        heading: "How we use information",
        paragraphs: [
          "We use information to authenticate you, provide personal and shared budgeting features, calculate balances and reports, show information to authorized members of a shared budget, send invitations and requested notifications, and protect the service from misuse.",
          "Jamvi does not sell your personal information. We do not use your financial records to provide financial advice or to make decisions about your eligibility for credit, insurance, employment, or other services.",
        ],
      },
      {
        heading: "Shared budgets",
        paragraphs: [
          "Information entered into a shared budget is visible to the members who have access to that shared budget. Only add information that you are comfortable sharing with those members.",
          "Personal budgets remain separate from shared budgets. Shared bank funds, goals, reports, activity, and history belong to the shared workspace and are available according to that workspace's roles and permissions.",
        ],
      },
      {
        heading: "Service providers and storage",
        paragraphs: [
          "Jamvi uses trusted service providers to host the application, store data, authenticate accounts, deliver email, and store private photos. These providers process information only as needed to provide their services to Jamvi.",
          "Uploaded photos are stored privately and are accessed through temporary authorized links. We do not intentionally make private workspace or profile photos publicly accessible.",
        ],
      },
      {
        heading: "Security and retention",
        paragraphs: [
          "We use reasonable technical and organizational safeguards to protect your information. No online service can guarantee absolute security, so please protect your sign-in account and report anything suspicious.",
          "We retain information while your account or workspace needs it, or as needed for security, legal, and operational purposes. You can request correction or deletion of information through the Jamvi support contact associated with your account.",
        ],
      },
      {
        heading: "Cookies and sessions",
        paragraphs: [
          "Jamvi uses essential cookies and session information to keep you signed in, protect requests, and remember the service state needed for the application to work. Jamvi does not use advertising cookies to track you across unrelated websites.",
        ],
      },
      {
        heading: "Changes and contact",
        paragraphs: [
          "We may update this policy as Jamvi changes. The date below identifies the latest version. If you have a privacy question or request, contact the Jamvi team through the support contact provided with your account or invitation.",
        ],
      },
    ],
  },
  terms: {
    title: "Terms of Service",
    description:
      "The rules for using Jamvi personal and shared budgeting workspaces.",
    intro:
      "These Terms of Service describe the rules for using Jamvi. By using Jamvi, you agree to follow these terms.",
    sections: [
      {
        heading: "Using Jamvi",
        paragraphs: [
          "Jamvi provides tools for recording and organizing personal and shared budget information. You are responsible for the accuracy of the information you enter and for reviewing records before relying on them.",
          "You must use an account that belongs to you, keep your sign-in access secure, and provide truthful information when managing a workspace or inviting another person.",
        ],
      },
      {
        heading: "Shared workspaces",
        paragraphs: [
          "A shared budget is a collaborative workspace. Workspace owners and administrators may manage members, invitations, shared setup, and shared money records according to the permissions shown in Jamvi.",
          "Do not invite someone to a shared budget or expose financial information without the appropriate permission. Members should use their own accounts and participate under their own names.",
        ],
      },
      {
        heading: "Your content",
        paragraphs: [
          "You keep responsibility for the budget records, photos, and other content you submit to Jamvi. You give Jamvi permission to host, process, display, and back up that content only as needed to operate and improve the service.",
          "Do not upload content that is unlawful, harmful, fraudulent, infringing, or that you do not have permission to share. Do not attempt to access another person's account, workspace, or private files.",
        ],
      },
      {
        heading: "Financial information",
        paragraphs: [
          "Jamvi is an organization and record-keeping tool, not a bank, payment service, accounting firm, or financial adviser. Reports and balances depend on the information entered by users and may contain errors if records are incomplete or incorrect.",
          "Do not treat Jamvi as a replacement for independent financial, tax, legal, or investment advice. Keep appropriate records and make important financial decisions using information you have independently verified.",
        ],
      },
      {
        heading: "Availability and changes",
        paragraphs: [
          "We work to keep Jamvi available and accurate, but the service may occasionally be unavailable for maintenance, updates, security work, or circumstances outside our control. Features may change as the service develops.",
          "We may suspend or restrict access when necessary to protect Jamvi, its users, or a workspace, including in response to abuse, fraud, security threats, or a serious violation of these terms.",
        ],
      },
      {
        heading: "Ending use",
        paragraphs: [
          "You may stop using Jamvi at any time. Workspace owners should coordinate with members before removing a workspace or its records. Sections of these terms that by their nature should continue, including responsibilities around content, security, and limitations, remain effective after use ends.",
        ],
      },
      {
        heading: "Changes to these terms",
        paragraphs: [
          "We may update these terms as Jamvi changes. Continued use of Jamvi after an update means you accept the revised terms. If you have a question about these terms, contact the Jamvi team through the support contact provided with your account or invitation.",
        ],
      },
    ],
  },
} satisfies Record<
  LegalPageKind,
  {
    title: string;
    description: string;
    intro: string;
    sections: { heading: string; paragraphs: string[] }[];
  }
>;

export function LegalPage({ kind }: { kind: LegalPageKind }) {
  const content = pageContent[kind];

  useEffect(() => {
    document.title = `${content.title} | Jamvi`;
    const description = document.querySelector('meta[name="description"]');
    if (description) {
      description.setAttribute("content", content.description);
    }
  }, [content]);

  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground sm:px-8 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <header className="mb-10 flex items-center justify-between gap-4 border-b border-border pb-6">
          <Link
            href="/"
            className="flex items-center gap-3 rounded-xl outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="link-jamvi-home"
          >
            <span
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm"
              aria-hidden="true"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
              >
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                <polyline points="17 6 23 6 23 12" />
              </svg>
            </span>
            <span className="font-display text-xl font-bold tracking-tight">Jamvi</span>
          </Link>
          <Link
            href="/"
            className="text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="link-back-to-jamvi"
          >
            Back to Jamvi
          </Link>
        </header>

        <article className="prose prose-green max-w-none dark:prose-invert">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-primary">
            Jamvi
          </p>
          <h1 data-testid={`heading-${kind}-title`}>{content.title}</h1>
          <p className="lead" data-testid={`text-${kind}-intro`}>
            {content.intro}
          </p>
          <p className="not-prose mb-8 text-sm text-muted-foreground">
            Last updated: August 26, 2026
          </p>

          {content.sections.map((section) => (
            <section key={section.heading} data-testid={`section-${kind}-${section.heading.toLowerCase().replaceAll(" ", "-")}`}>
              <h2>{section.heading}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </section>
          ))}
        </article>

        <footer className="mt-12 border-t border-border pt-6 text-sm text-muted-foreground">
          <p data-testid="text-legal-footer">
            Jamvi helps people organize money together with clarity and trust.
          </p>
        </footer>
      </div>
    </main>
  );
}

export function PrivacyPolicyPage() {
  return <LegalPage kind="privacy" />;
}

export function TermsOfServicePage() {
  return <LegalPage kind="terms" />;
}