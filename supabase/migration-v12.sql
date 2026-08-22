-- v12: binding wheel spins
-- Paste into Supabase SQL Editor -> New query -> Run
--
-- Personal wheel: spin 1 creates an OFFERED contract (sign it, or burn
-- your single re-spin — which signs itself). Public wheel: the week's
-- first spin signs immediately. The pending offer lives in this table,
-- not in anyone's browser tab, which is what makes refreshing useless
-- as an escape hatch. The partial unique index is the belt-and-braces
-- against a double-spin race opening two offers for one member.

alter table contracts add column if not exists status text not null default 'signed';
alter table contracts add column if not exists respun boolean not null default false;
create unique index if not exists one_offer_per_member
  on contracts (steamid) where status = 'offered';
