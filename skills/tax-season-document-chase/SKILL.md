---
name: tax-season-document-chase
description: Use when a tax preparer, EA, CPA or bookkeeper wants to collect documents from many clients at once for a tax season — turning a client list into one DokuTrak request per client with the right checklist (W-2, 1099s, K-1, rental, Schedule C…), getting the batch confirmed, sending it, and later reporting who is still missing what.
---

# Tax-season document chase

The Professional hands you a client list; you hand back one confirmed DokuTrak Document
Request per client and, later, a single table of who is missing what. You prepare and
track. The Professional decides the checklist, confirms every request, and approves every
file — you never skip their confirmation, and DokuTrak enforces it anyway.

Done when every client on the list has a sent request (or a reason it was skipped), and the
Professional has the tracking table.

## 0. Check the tools

Look at which DokuTrak tools you have:

- **Hosted connector** (claude.ai, ChatGPT, this plugin): `prepare_request`,
  `review_request`, `send_request`, `get_request`.
- **Local connector** (`dokutrak-mcp` over stdio): `create_request`, `get_request`,
  `request_replacement`, `download_documents`.

Neither present: the Professional adds `https://app.dokutrak.com/api/mcp` as a connector
(setup: https://dokutrak.com/connectors), then you start again. If a tool answers that the
Workspace isn't connected, the Professional signs in to DokuTrak when the client prompts;
connecting sends nothing.

## 1. Get the client list

Accept whatever the Professional has: names pasted in chat, a CSV, or an export from their
practice or tax software. You need, per client: name, email, and what kind of return it is.
Never guess or complete an email address. Rows without one go to a "needs email" list you
show at the end of step 3.

If the list doesn't say what kind of return each client has, ask once for the whole list,
in one message, using the profiles below. Don't interview client by client.

## 2. Build each checklist

Start from the profile, then adjust to what the Professional tells you. A client can
combine profiles (W-2 + rental); merge them and drop duplicates. **At most 10 documents per
request** (hosted connector limit): if a merge goes over, ask the Professional what to cut.

Give typed documents their `doc_type_id` (hosted connector): DokuTrak then checks each
upload against the form it expects. Items without a type are still collected; the
Professional reviews them by hand. Don't tell the Professional that untyped items are
checked automatically. The local connector's `create_request` takes titles only, so on that
connector nothing is typed.

| Profile | Typed (`doc_type_id`) | Untyped (title only) |
|---|---|---|
| W-2 employee | `w-2`, `1099-int`, `1099-div` | — |
| 1099 contractor | `1099-nec`, `1099-misc` | Business expense summary |
| Schedule C business | `1099-nec`, `bank-statement` (`coverage_days: 365`), `credit-card-statement` | 1099-K, Business expense summary |
| Rental property | `1098`, `property-tax-bill`, `lease` | Rent received and expenses for the year |
| Partner / S-corp shareholder | `k-1`, `investment-statement` | — |
| Investor | `1099-div`, `1099-int`, `investment-statement` | 1099-B |
| Retiree | `ssa-1099`, `1099-r`, `1099-int` | — |
| Homeowner | `1098`, `property-tax-bill` | — |
| Student / education credit | `1098-t` | — |
| New client (add to any profile) | `1040-prior-year`, `drivers-license` | — |

Write each document's `title` the way the client will read it ("Form W-2 (tax year 2025),
one per employer"), and put the tax year in it. Mark a document `required: false` only when
the Professional says it may not apply.

**Deadline.** One deadline for the batch unless the Professional says otherwise. DokuTrak
accepts up to 180 days ahead. Forms for a tax year arrive from late January to mid
February, so for the current tax year propose a date after that (e.g. February 28) and let
the Professional pick; for a prior year, propose two weeks out.

**Message.** Optional, one per batch, from the Professional, in their words. Offer a two-line
draft only if asked.

## 3. Confirm the batch

Show one table before anything is created: client, email, profile, documents (typed ones
marked), deadline. Then the "needs email" list. Ask the Professional to confirm or correct
in one reply. Apply every correction and show the changed rows again. Nothing goes out
before a clear yes.

## 4. Send

**Hosted connector**, per client:

1. `prepare_request` with the confirmed details. Fix anything it rejects, then keep the
   returned preview unchanged.
2. `review_request` with that preview and a new UUID `operation_id` for this client. Reuse
   the same `operation_id` if you retry this client; a new one only if details changed.
3. Collect the `reviewUrl`s. Give the Professional the full list at once: they open each one
   and confirm in DokuTrak. This step is theirs; you cannot do it for them.
4. When they say a client is confirmed, `send_request` with that `operation_id` and the
   `version` from `review_request`. `sent` means the email provider accepted it.
   `delivery_unknown`: tell the Professional to check it in DokuTrak; never resend.

**Local connector:** `create_request` per client, one call each, with the confirmed details.
The client app asks the Professional to approve each call; that is expected. If a result says
created but not sent, report it: it can be sent from the dashboard.

Keep a running table in the conversation: client, `operation_id` or request id, status
(prepared, awaiting confirmation, sent, failed + reason). Offer it as CSV at the end so the
Professional can paste it back next time to track the batch.

## 5. Track who is missing what

When the Professional asks "where are we?", call `get_request` per client (by id from the
table, or by `search` on the client's name or email; if several match, ask which). Report
one table, most-missing first:

| Client | Received | Approved | Rejected (reason) | Still missing | Next automatic reminder |

Received is not approved: only the Professional's review approves a file. Silent clients are
reminded automatically on DokuTrak's cadence; no tool sends an extra reminder, so say when
the next one is due instead of promising one.

Rejected files:
- Local connector: `request_replacement` flags them and reopens the request. It sends no
  email itself; the next reminder carries it.
- Hosted connector: the Professional handles it in DokuTrak.

Files themselves: the hosted connector never returns file content; the Professional opens
DokuTrak, or uses `download_documents` on the local connector.

## Never

- Send, or call `create_request`, before the batch is confirmed.
- Invent an email, a form a client didn't mention, or a deadline.
- Give tax advice beyond which documents to ask for; the Professional owns the checklist.
- Claim DokuTrak does something its tools don't: it doesn't file returns, sync with tax
  software, or send reminders on demand.
- Relay a refusal as your own opinion: quote the tool's reason.
