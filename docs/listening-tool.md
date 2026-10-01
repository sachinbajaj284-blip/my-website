# Listening tool — find people asking questions we can answer

Every morning at about 7:45 IST this tool reads the newest posts in about a
dozen Indian student and career subreddits. It keeps the ones where someone is
asking something Sachin can genuinely help with, and puts them in a Google
Sheet. Telegram gets a short summary.

**It never posts, comments or messages anyone.** A person reads each post and
replies by hand, from their own account. That is the whole point: helpful
answers from a real counsellor build a reputation, while automated comments
get accounts banned and do real harm to people who are struggling.

| Piece | File |
|---|---|
| Subreddits, phrases, reply starters (edit these freely) | `tools/listen/config.mjs` |
| Scoring | `tools/listen/score.mjs` |
| Fetch + send | `tools/listen/listen.mjs` |
| Tests (run on every push) | `tools/listen/listen.test.mjs` |
| Daily schedule | `.github/workflows/listen.yml` |
| Google Sheet + Telegram script | `docs/listening-webhook.gs` |

Cost: free. It uses no AI and no paid API.

---

## One-time setup (about 20 minutes)

### 1. The Google Sheet
1. Create a **new** Google Sheet, called something like `Lume Live — listening`.
   Keep it separate from the enquiries Sheet.
2. Open **Extensions → Apps Script**, delete the sample code, and paste in all of
   `docs/listening-webhook.gs`.
3. Set `SHARED_TOKEN` to any long random phrase, and note it down.
4. Click **Deploy → New deployment → Web app**. Set **Execute as: Me** and
   **Who has access: Anyone**, then click **Deploy**, authorise, and copy the
   **Web app URL**.

### 2. Telegram (optional, but it's what reaches your phone)
1. In Telegram, message **@BotFather**, send `/newbot` and copy the token.
2. Send your new bot any message. Then message **@userinfobot** to get your chat ID.
3. Put both values into `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in the
   script. Then go to **Deploy → Manage deployments → edit → New version** so
   the change goes live.

### 3. A free Reddit app (strongly recommended)
Reddit often refuses anonymous requests from GitHub's servers. An app login
fixes that. The login is read-only and cannot post anything.
1. Log in to Reddit and open <https://www.reddit.com/prefs/apps>. Click
   **create another app**.
2. Name it `lumelive-listener`, choose type **script**, and set the redirect URI
   to `http://localhost`.
3. Copy the ID shown under the app name, and the **secret**.

### 4. GitHub secrets
Go to **GitHub → this repo → Settings → Secrets and variables → Actions → New
repository secret**:

| Name | Value |
|---|---|
| `LISTEN_WEBHOOK_URL` | Web app URL from step 1 |
| `LISTEN_WEBHOOK_TOKEN` | The `SHARED_TOKEN` phrase |
| `REDDIT_CLIENT_ID` | From step 3 |
| `REDDIT_CLIENT_SECRET` | From step 3 |

### 5. Test it
1. Go to **Actions → Listening tool → Run workflow** and leave **dry_run**
   ticked. The log shows the list, and nothing is sent.
2. Run it again with **dry_run** unticked. Rows should appear in the Sheet and a
   Telegram message should arrive.
3. Run it a third time. **No** new rows should appear, because posts already in
   the Sheet are skipped.

After that it runs on its own every morning.

---

## Daily use (15–30 minutes)

1. Open the Sheet. Rows highlighted in red (⚠) are people who may be
   struggling. **Look at those first.**
2. For each row, open the link and read the whole post **and the replies already
   there**.
3. Use the **reply starter** as a starting point only. Rewrite it so it answers
   *this* person: use their details, their rank, their stream. A reply pasted
   unedited reads as spam, and Reddit users notice.
4. Post from Sachin's own Reddit account, then set **Status** to `Replied` or
   `Skipped`.

### Rules that keep the account alive and the brand trusted
- **Read each subreddit's rules first.** Several ban self-promotion or links
  outright. In those, answer with no link at all.
- **For every 10 replies, at most 1 mentions Lume Live.** The rest are just
  good answers. Reputation comes from the profile and the answers, not from
  links.
- **Say who you are when it matters:** "I'm a counselling psychologist", never
  "a student here".
- **Never DM someone who posted about distress**, and never mention price or
  booking to them. Reply in public with care and give Tele-MANAS (14416).
- **Crisis rows (🚨):** reply the same day with the helplines in the starter.
  If the post suggests immediate danger, use Reddit's "Report → Someone is
  considering suicide or self-harm" option too, which sends them Reddit's
  support resources.
- No more than about 10–15 replies a day from one account. New accounts that
  post a lot get filtered as spam.

---

## Tuning
- **Too many irrelevant posts?** Raise `MIN_SCORE` in `config.mjs`, or remove
  the weak (weight 2) phrases that keep matching.
- **Too few?** Add phrases you see real people using, or add subreddits.
- **Add a subreddit:** add its name to `SUBREDDITS`. If a subreddit is renamed
  or goes private, the run logs `skipped` and carries on with the others.
- After any edit, run `npm run listen:test`. `npm run listen` prints today's
  list locally without sending it, if your network can reach Reddit.

## Not covered (and why)
- **Instagram, Facebook, Quora:** these platforms have no legitimate public API
  for searching posts. Automating them breaks their terms and gets accounts
  banned.
- **X (Twitter):** its search API costs about $200 a month.
- **YouTube comments:** possible with a free API key. A good next addition if
  Reddit works out.
