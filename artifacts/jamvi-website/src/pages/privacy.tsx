import { useSeo } from "@/hooks/use-seo";
import { LegalPage, Todo } from "@/components/layout/LegalPage";
import { JAMVI_SUPPORT_EMAIL } from "@/lib/site-links";

export default function Privacy() {
  useSeo({
    title: "Privacy Policy",
    description:
      "What personal data Jamvi collects, why, who processes it, where it is stored, and the rights you have over it under Kenya's Data Protection Act.",
  });

  return (
    <LegalPage title="Privacy Policy" effective={<Todo>the date you publish this</Todo>}>
      <p>
        This policy explains what we do with your personal data.{" "}
        <strong>Optimum Prime Solutions Ltd</strong> is the data controller for
        Jamvi, and this policy is written to meet the Data Protection Act, 2019.
      </p>

      <h2>1. What we collect</h2>

      <h3>When you sign in</h3>
      <p>
        You sign in with Google. From that we receive your <strong>email
        address</strong>, your <strong>name</strong>, and your{" "}
        <strong>Google profile photo</strong>. We never see or store your Google
        password.
      </p>

      <h3>What you give us</h3>
      <ul>
        <li>a display name, if you set one different from your Google name;</li>
        <li>a profile photo, if you upload one;</li>
        <li>the financial records you enter — contributions, expenses, budgets, savings goals, contribution targets, and any description you write on them;</li>
        <li>the email addresses of people you invite to a group.</li>
      </ul>
      <p>
        <strong>We do not collect bank details, M-Pesa PINs, card numbers, or
        national ID numbers.</strong> Jamvi never moves money, so it has no reason
        to hold anything that could move it.
      </p>

      <h3>What is created automatically</h3>
      <ul>
        <li>a session record, so you stay signed in;</li>
        <li>the dates records were created and changed;</li>
        <li>server logs, which may include your IP address and the requests you made, kept for security and diagnosis.</li>
      </ul>

      <h2>2. Why we use it, and on what basis</h2>
      <ul>
        <li><strong>To provide the service</strong> — showing your records to you and to the group members you share them with. Basis: performance of our contract with you.</li>
        <li><strong>To send necessary email</strong> — group invitations and the monthly digest. Basis: performance of our contract, and your consent for anything optional.</li>
        <li><strong>To keep Jamvi secure and working</strong> — diagnosing faults, preventing abuse. Basis: our legitimate interest in a service that functions.</li>
        <li><strong>To meet legal obligations</strong> where we have them.</li>
      </ul>
      <p>
        <strong>We do not sell your personal data, and we do not use your
        financial records to advertise to you.</strong>
      </p>

      <h2>3. Who else processes it</h2>
      <p>
        We use a small number of providers to run Jamvi. They process data on our
        instructions only:
      </p>
      <ul>
        <li><strong>Google</strong> — sign-in.</li>
        <li><strong>Render</strong> — hosting and the database.</li>
        <li><strong>Resend</strong> — sending invitation and digest emails.</li>
        <li><strong>Cloudflare</strong> — domain name service and protection.</li>
        <li><strong>Object storage</strong> for profile photos: <Todo>name the storage provider — Cloudflare R2 or the S3 provider you use</Todo>.</li>
      </ul>
      <p>
        Other members of a group you join will see the records you share with
        them. That is the purpose of a shared workspace, and it is the main way
        your information reaches other people.
      </p>

      <h2>4. Where your data is stored</h2>
      <p>
        Jamvi runs in <strong>Frankfurt, Germany</strong>, so your data is stored
        and processed outside Kenya. Our other providers may also process data
        outside Kenya.
      </p>
      <p>
        We rely on <Todo>the transfer basis under sections 48–49 of the Data
        Protection Act — usually appropriate safeguards in the provider's data
        processing agreement</Todo> for those transfers.
      </p>

      <h2>5. How long we keep it</h2>
      <p>
        We keep your account information while your account is open. If you close
        it, we delete or anonymise your personal data within{" "}
        <Todo>retention period after account closure</Todo>, except where we must
        keep something longer by law.
      </p>
      <p>
        Because a group's ledger is a shared record, <strong>contributions and
        expenses recorded in a group do not disappear when you close your
        account</strong> — the remaining members keep their history. Where we can,
        we remove your name from it.
      </p>

      <h2>6. Your rights</h2>
      <p>Under the Data Protection Act you may ask us to:</p>
      <ul>
        <li>tell you what data we hold about you, and give you a copy;</li>
        <li>correct anything inaccurate;</li>
        <li>delete your data, where we are not required to keep it;</li>
        <li>stop or restrict a particular use;</li>
        <li>give you your data in a portable form.</li>
      </ul>
      <p>
        Write to <a href={`mailto:${JAMVI_SUPPORT_EMAIL}`}>{JAMVI_SUPPORT_EMAIL}</a> and
        we will respond within the statutory period.
      </p>

      <h2>7. Security</h2>
      <p>
        Connections to Jamvi are encrypted. Data is stored on managed
        infrastructure with access limited to those who need it to operate the
        service. Session cookies are restricted to Jamvi and are not readable by
        scripts in your browser.
      </p>
      <p>
        No service can promise perfect security. If a breach affects your rights,
        we will notify you and the Office of the Data Protection Commissioner as
        the Act requires.
      </p>

      <h2>8. Cookies</h2>
      <p>
        Jamvi sets one <strong>essential cookie</strong> to keep you signed in.
        There are no advertising or third-party tracking cookies, which is why you
        are not asked to accept them.
      </p>

      <h2>9. Children</h2>
      <p>
        Jamvi is not intended for anyone under 18. If we learn that we hold a
        child's data without proper consent, we will delete it.
      </p>

      <h2>10. Changes</h2>
      <p>
        If we change this policy in a way that materially affects you, we will
        tell you by email or in the app before it takes effect.
      </p>

      <h2>11. Contact and complaints</h2>
      <p>
        For anything about your data:{" "}
        <a href={`mailto:${JAMVI_SUPPORT_EMAIL}`}>{JAMVI_SUPPORT_EMAIL}</a>. Our data
        protection contact is <Todo>data protection contact, and whether Optimum is registered with the ODPC</Todo>.
      </p>
      <p>
        If you are not satisfied with our answer, you can complain to the{" "}
        <strong>Office of the Data Protection Commissioner</strong> in Kenya.
      </p>
    </LegalPage>
  );
}
