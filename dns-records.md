# DNS Records Pack — Giftora

DNS records to configure at the domain registrar / DNS host for **gift-ora.online**.

Reference DNS host used for the records below: **TITAN** (selector prefix `titan1`).

---

## 1. DKIM — Email Authentication

Signatures outgoing mail so it isn't marked as spam. Required for Gmail / Yahoo bulk-sender rules.

| Field | Value |
|---|---|
| Type | `TXT` |
| Host / Name | `titan1._domainkey` |
| TTL | `3600` (or auto) |
| Priority | — |
| Value | see below (single line, no line breaks) |

```
titan1._domainkey v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCMhUfJhCrgWG1d58OGfpsBcOt/UHFIEIDAIgUAzwJap0i8u2TCysoc38BaGet3mFYGeeYHCqHLqzwSOkumQ9hIFL216vKXraOFdyN3kxxPS+x8Mk9qyeFtsxQDJyeVvfcdd62zW6tm8Yb9rToLkfG7Z8NR14JAXaQ4IbMxzJ/0zwIDAQAB
```

Notes:
- At some hosts (Cloudflare, GoDaddy) the TXT **value** field only takes the part after the host name — i.e. start from `v=DKIM1;`.
- Key type is **RSA 1024-bit** (`MIGf` prefix). Gmail accepts it, but 2048-bit is preferred if the mail provider can issue a stronger key.
- Do **not** split the value into multiple quoted strings; paste it as one continuous string.

---

## 2. Related records to confirm

These are normally issued alongside the DKIM key — verify they already exist before adding duplicates.

| Type | Host | Purpose |
|---|---|---|
| `TXT` | `@` | SPF — lists the mail servers allowed to send for the domain |
| `TXT` | `default._domainkey` | Google Workspace / Google Apps DKIM (only if using a Google mail domain) |
| `CNAME` | `*.domainkey` | Google Workspace DKIM (only if using a Google mail domain) |
| `MX` | `@` | Mail routing — required if the domain receives mail |

Do not add the `default._domainkey` or `*.domainkey` rows unless a Google mail provider explicitly asks for them — two conflicting DKIM setups break signing.

---

## 3. Verification

1. **DNS lookup** — confirm the record resolves:

   ```bash
   nslookup -type=TXT titan1._domainkey gift-ora.online
   # or
   dig TXT titan1._domainkey gift-ora.online +short
   ```

2. **DKIM check** — send a test email from the signing address and verify the `DKIM-Signature` header, or use https://dkimvalidator.com

3. **Live send test** — after TXT is live, check a sent message's `Authentication-Results` for `dkim=pass`. DNS changes can take up to 24h to propagate (usually minutes to a few hours).

---

## 4. Related files

- `mailer.js` — SMTP sending logic
- `mail-config.example.json` — Gmail app-password SMTP config (copy to `mail-config.json` and fill in; never commit the real file)
- `.env.example` — environment variable template
