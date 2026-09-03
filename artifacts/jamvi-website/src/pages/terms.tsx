import { useSeo } from "@/hooks/use-seo";
import { LegalPage } from "@/components/layout/LegalPage";
import { JAMVI_SUPPORT_EMAIL } from "@/lib/site-links";

export default function Terms() {
  useSeo({
    title: "Terms of Service",
    description:
      "The terms on which Jamvi is provided: what the service does, what it deliberately does not do, and the responsibilities of everyone using it.",
  });

  return (
    <LegalPage title="Terms of Service" effective="30 August 2026">
      <p>
        These terms are an agreement between you and{" "}
        <strong>Optimum Prime Solutions Ltd</strong>, a company registered in
        Kenya and based in Nairobi, which operates Jamvi. By creating an account
        you accept them.
      </p>

      <h2>1. What Jamvi is</h2>
      <p>
        Jamvi is a record-keeping tool. It helps individuals, families, chamas,
        clubs and other groups record contributions, expenses, balances and
        savings goals, and share that record with the people it concerns.
      </p>

      <h2>2. What Jamvi is not</h2>
      <p>
        This section matters more than any other, so it is stated plainly.
      </p>
      <ul>
        <li>
          <strong>Jamvi is not a bank and not a payment service.</strong> It does
          not send, receive, hold, or transfer money. It never touches your funds.
        </li>
        <li>
          <strong>Jamvi does not verify that a payment happened.</strong> Records
          are entered by you and by other members of your group. We do not check
          them against M-Pesa, a bank, or any other source.
        </li>
        <li>
          <strong>Jamvi does not give financial, investment, tax, or legal
          advice.</strong> Nothing in the service is a recommendation.
        </li>
        <li>
          <strong>Jamvi is not a party to your group's arrangements.</strong> Your
          chama's rules, its constitution, and any obligation between its members
          are between those members.
        </li>
      </ul>
      <p>
        If members of a group disagree about who paid what, that is a matter
        between them. We can show what the record says and who entered it. We
        cannot decide who is right, recover money, or enforce a contribution.
      </p>

      <h2>3. Your account</h2>
      <p>
        You sign in with Google. You are responsible for keeping access to that
        Google account secure, and for everything done through your Jamvi account.
      </p>
      <p>
        You must be at least 18, or old enough to enter a contract where you live,
        and you must give accurate information about yourself.
      </p>

      <h2>4. Groups and what other people can see</h2>
      <p>
        A workspace is shared. When you join one, the other members can see your
        name, your profile photo, the contributions and expenses recorded against
        you, and any contribution target set for you. Consider that before you
        join a group or record something in one.
      </p>
      <p>
        Whoever administers a group can invite and remove members and change its
        settings. Corrections to past transactions carry a visible reason, so the
        history stays honest.
      </p>

      <h2>5. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>use Jamvi for anything unlawful, including money laundering, fraud, or a scheme that depends on recruiting other people;</li>
        <li>record another person's information without a proper reason to do so;</li>
        <li>attempt to access a workspace or account you were not invited to;</li>
        <li>interfere with the service, probe it for weaknesses without our written permission, or overload it;</li>
        <li>resell or white-label Jamvi without an agreement with us.</li>
      </ul>

      <h2>6. Free and paid plans</h2>
      <p>
        Every account includes one Personal budget free permanently. Shared
        budgets use one group subscription chosen by the owner or administrator;
        invited members do not pay individually. Each package has its own member
        limit. Nobody is removed automatically when a group reaches its limit.
      </p>
      <p>
        Current prices and what each plan includes are shown on our{" "}
        <a href="/pricing">Pricing page</a>. We will give reasonable notice
        before changing the price of a plan you are already on.
      </p>
      <p>
        Payment processing is not active yet. Selecting a package during this
        phase does not by itself create a paid or active subscription, and Jamvi
        will not charge you automatically.
      </p>

      <h2>7. Your records belong to you</h2>
      <p>
        You keep ownership of everything you put into Jamvi. You grant us only the
        permission needed to store it, display it to the people you have shared it
        with, and operate the service.
      </p>
      <p>
        Because a shared workspace is a joint record, deleting your own account
        does not erase the group's history of contributions and expenses. What
        happens to your personal information is described in our{" "}
        <a href="/privacy">Privacy Policy</a>.
      </p>

      <h2>8. Availability</h2>
      <p>
        We work to keep Jamvi running, but we do not promise it will be available
        without interruption. We may change, suspend, or withdraw features. Where
        a change is significant and we can give notice, we will.
      </p>
      <p>
        Keep your own copy of anything you cannot afford to lose. We take backups,
        but you should not rely on Jamvi as your only record.
      </p>

      <h2>9. Liability</h2>
      <p>
        Jamvi is provided as it is. To the extent the law allows, we are not
        liable for money lost through a disputed contribution, an inaccurate entry,
        a decision taken on the basis of what the app showed, or a dispute between
        members of a group.
      </p>
      <p>
        Nothing here limits liability that cannot lawfully be limited — including
        liability for death or personal injury caused by negligence, or for
        fraud. Where our liability can be limited, it is capped at the total
        amount you paid us in the twelve months before the claim arose.
      </p>

      <h2>10. Suspension and ending your account</h2>
      <p>
        You can stop using Jamvi and close your account at any time. We may suspend
        or close an account that breaks these terms, that is being used unlawfully,
        or where we are required to.
      </p>

      <h2>11. Changes to these terms</h2>
      <p>
        We may update these terms. If a change materially affects you we will give
        notice by email or in the app before it takes effect. Continuing to use
        Jamvi after that means you accept the updated terms.
      </p>

      <h2>12. Governing law</h2>
      <p>
        These terms are governed by the laws of Kenya, and the courts of Kenya have
        jurisdiction over any dispute.
      </p>

      <h2>13. Contact</h2>
      <p>
        Questions about these terms: <a href={`mailto:${JAMVI_SUPPORT_EMAIL}`}>{JAMVI_SUPPORT_EMAIL}</a>.
      </p>
    </LegalPage>
  );
}
