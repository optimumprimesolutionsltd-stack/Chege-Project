# Teaching Jamvi to read M-Pesa

*Draft for review. Every name and figure below is invented. Nothing here is published until you say so.*

Most of what Kenyans spend passes through M-Pesa. Most of what a budget needs to know
is therefore already written down, in a statement PDF and in a phone full of text
messages. And yet the first thing every budgeting app asks you to do is type it all in
again. People give up in the second week.

We decided Jamvi would not ask. This is how it works, and what we had to get right.

## The rule we would not break

**Jamvi never guesses about your money.** A budget that is quietly wrong is worse than
no budget. So the parser recognises the M-Pesa message and statement formats we have
actually seen, one family at a time, from anonymised examples. When it meets something it
does not know, it says so and leaves the line out with a reason. It never invents an
answer. And a message it cannot read can be sent to us, so the next update understands it.

## Two ways in

**Paste your messages.** Select as many M-Pesa messages as you like, copy them, paste
them in, or share them straight to Jamvi on Android. Jamvi reads them to fill in the
list and does not keep them.

**Bring the statement PDF.** Choose the file and type its password. The PDF is read on
your own phone or computer. It is never uploaded, and neither is the password.

Both end in the same place: a list you check, and a save button. Nothing is recorded
until you press it.

## The hard parts

**A statement is a table drawn on a page.** Reading it as text puts amounts in the wrong
column about half the time, because a row's details wrap over several lines. So Jamvi
works from the exact position of every piece of text. And where the statement mirrors its
own columns (a Fuliza payment sits under Paid In and its loan draw under Withdrawn), it
decides direction from what the row says it is.

**Fuliza.** What a Fuliza loan paid for is your spending, so it is recorded as a normal
payment. The loan itself and its repayments are not spending or income, so they are left
out, and Jamvi tells you how many it left out.

**Does it add up?** Before it will use a statement, Jamvi checks that every payment
follows from the balance before it. If it does not add up, Jamvi refuses the file rather
than record wrong amounts. After you choose what to save, it compares the result with the
statement's own opening and closing balance, and lists what makes up any difference, so
nothing disappears quietly.

**Money that is not yours to count.** A payment from your bank into M-Pesa and on to
another bank is not income and not spending. A loan from your own company is not income.
Money you lend is not a cost. So every line can be a move between your own accounts, a
debt or loan with a person or a company, a step into savings, or a member's contribution.
Each of those is recorded as what it is, and Jamvi offers to update the balances but
never does it behind your back.

## It learns, a little

The category of a payment is suggested from your own books: the payee you paid before, a
payee with a similar name, or a word that has nearly always meant one category ("hotel"
means Travel, in your books). You can ask it to remember a choice, and see and forget
what it has remembered. Suggestions are always marked as Jamvi's, and yours always win.

## At your own pace

Save some entries now and the rest another day. What is left is kept on your device, and
anything already recorded is recognised and never counted twice.

## What we are proud of

Not that it is clever. That it is careful. It says what it left out, it checks its own
arithmetic against the statement, and it leaves the decisions that are yours to you.

*Note for editors: do not describe this as "connecting to M-Pesa" or "syncing". It is an
import the person chooses to do.*
