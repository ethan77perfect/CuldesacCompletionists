-- v9: Achievement Bingo
-- Paste into Supabase SQL Editor -> New query -> Run
--
-- Cards are DEALT ONCE and persisted — a card that reshuffled on every
-- page load would let mid-round unlocks silently rewrite the board.
-- Marking is computed live client-side from Steam data; only the deal
-- is stored. Deleting a round cascades its cards.

create table if not exists bingo_rounds (
  id         bigint generated always as identity primary key,
  label      text not null,
  created_at timestamptz not null default now()
);

create table if not exists bingo_cards (
  round_id   bigint not null references bingo_rounds(id) on delete cascade,
  steamid    text   not null,
  cells      jsonb  not null,   -- 24 entries: {appid, achid, ach, game, pct} (center is FREE)
  created_at timestamptz not null default now(),
  primary key (round_id, steamid)
);

alter table bingo_rounds enable row level security;
alter table bingo_cards  enable row level security;
