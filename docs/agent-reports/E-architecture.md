# Agent E — Architecture Proposal

## 1. Tech stack decision

**Next.js (App Router) + TypeScript + Tailwind v4 + shadcn/ui + Drizzle ORM + SQLite (better-sqlite3), no auth in MVP. Supabase/Vercel deferred to a documented migration path.**

- (a) `npm run dev` with zero accounts: Supabase fails this (provisioning, keys, network). SQLite is a file (`data/aiment.db`), seedable, inspectable with `sqlite3`. This alone decides the MVP.
- (b) 1–5 users: SQLite with WAL is ample.
- (c) Later deploy + MCP: handled by portability discipline.

Driver: **better-sqlite3** (contained via `serverExternalPackages: ['better-sqlite3']`, server-only). libsql adds async mismatch for unneeded remote capability. Prisma rejected (heavier toolchain; Drizzle schema-as-code doubles as docs for AI agents).

**Portability rules (day 1):** all services async; no SQLite-only SQL (aggregate in TS); dates as ISO-8601 TEXT (UTC); enums as TEXT validated in `constants.ts`; only column types with 1:1 pg equivalents.

**Migration path:** swap `sqlite-core` → `pg-core` in one schema file, point at Supabase, `drizzle-kit push`, 50-line copy script. Add Supabase Auth then (`members.auth_user_id` reserved, nullable).

**Auth: none in MVP.** Members are plain rows. "Who am I" = `member_id` cookie set by a member-picker.

## 2. Data model

**IDs:** text PKs, `prefix_nanoid(10)`: `obj_ ws_ ms_ task_ blk_ upd_ mem_`. Self-describing in logs/URLs/LLM tool calls. No slugs.

**Enums** (TEXT, single source `src/lib/constants.ts`):
```
objective.status: active|achieved|missed|archived    confidence: high|medium|low
health: on_track|at_risk|off_track                   workstream.status: active|done|archived
milestone.status: not_started|in_progress|achieved|dropped
task.status: todo|in_progress|done|dropped           task.priority: p0|p1|p2
blocker.status: active|resolved                      blocker.severity: critical|high|medium
actor_type: member|agent|system
```

### Tables (columns abridged; see schema.ts for authority)

- **workspace** (singleton `'workspace'`): name, focus_objective_id FK
- **members**: name, role, auth_user_id (reserved), is_active
- **objectives**: title, description, owner_id, start_date, target_date, status, confidence, confidence_note (WHY — crucial for AI), confidence_updated_at
- **workstreams**: objective_id, name, owner_id, status, health, health_note, health_updated_at (staleness signal, flag >7d), next_action (one line, manual), sort_order
- **milestones** ("achieved STATE, not work"): workstream_id, title, target_value REAL, current_value REAL, unit, weight (objective-scoped), status, due_date, sort_order
- **tasks**: title, workstream_id, milestone_id (nullable), owner_id, status, priority, due_date, note, completed_at, sort_order
- **blockers** (first-class): title, detail, workstream_id, task_id (nullable), owner_id (who UNBLOCKS), severity, status, resolution (learning record), resolved_at
- **updates** (heartbeat): workstream_id, author_id, what (required), result, next, milestone_id + value_before + value_after (provenance of counter moves)
- **activity_log** (append-only, machine-first): ts, actor_type, actor_id, entity_type, entity_id, action, detail JSON {field, before, after}

### Key decisions

- **Progress stored vs computed:** only milestone current/target stored. Milestone p = min(current/target, 1); `achieved` forces 1.0; `dropped` excluded. Workstream = Σ(w·p)/Σw of its milestones; Objective = Σ(w·p)/Σw across ALL its milestones (weights objective-scoped → levels can never disagree). **Never persisted**; computed in `progress.ts`. Change provenance in updates + activity_log.
- **Blocker:** separate entity, anchored to workstream, optional task pin, unblock-owner, resolution field. Flags can't hold ownership/age/resolution.
- **Update:** structured-lite. `what` required; result/next optional. No required blocker field — "+ blocker" creates a real blockers row. May carry a milestone value change ("18→20 because X").
- **Health:** manual per workstream (+ note + timestamp); dashboard shows "stale" badge >7 days. **Objective health = worst of active workstreams (computed, never stored).** Confidence only on objective, manual, note required in UI.
- **No soft delete**; terminal statuses + append-only activity_log written by service layer on every mutation.

## 3. API surface

**All business logic in plain async TS services; Server Actions are 3-line wrappers; thin read-only REST proves machine-readability; future MCP imports services directly.**

```
src/lib/services/
  dashboard.ts   getCurrentFocus(), getDashboardSummary()
  objectives.ts  getObjective(), listObjectives(), setConfidence(), setFocus()
  workstreams.ts listWorkstreams(), updateHealth(), setNextAction()
  milestones.ts  listMilestones(), createMilestone(), updateMilestoneProgress(), setStatus()
  tasks.ts       listTasks(), getMyTasks(), createTask(), updateTask()
  blockers.ts    getBlockers(), createBlocker(), resolveBlocker()
  updates.ts     getRecentUpdates(), addUpdate()   ← may also move a milestone
  members.ts     listMembers(), createMember()
  progress.ts    pure: milestoneProgress(), rollup()  (no db import)
  activity.ts    logActivity() — called by every mutating service
```

Rules: services import only db + constants + progress (no next/*, no React). Mutating services take `actor: {type, id}` → activity_log attributes agent writes.

- UI reads: RSC pages call services directly. UI writes: Server Actions → zod → service → revalidatePath.
- REST MVP: `GET /api/v1/summary|tasks|blockers|updates`, `POST /api/v1/tasks|updates`.
- Future MCP: `mcp/server.ts` (stdio), tools 1:1 to services, same SQLite file. Half-day task later.

## 4. Machine-readable response shapes

`getDashboardSummary()`: one call answers "aiment今どんな感じ?" — denormalized owner names alongside IDs, explicit enums, ISO dates, `as_of`, progress 0..1, `health_stale` booleans, `days_remaining`, current_milestone with current/target/unit, blockers with age_days, recent_updates with milestone_change {from, to}.

`getMyTasks(memberId)`: pre-sorted (p0 → overdue → due date), each task carrying its chain up (workstream {name, health}, milestone {title, progress}, blocked_by []).

## 5. Project structure

```
aiment_Dashboard/
├── next.config.ts                  # serverExternalPackages: ['better-sqlite3']
├── drizzle.config.ts
├── data/                           # gitignored; aiment.db
├── src/
│   ├── app/
│   │   ├── page.tsx                # THE dashboard (RSC)
│   │   ├── actions.ts              # all Server Actions
│   │   ├── objective/[id]/page.tsx
│   │   ├── workstream/[id]/page.tsx
│   │   ├── tasks/page.tsx
│   │   └── api/v1/{summary,tasks,blockers,updates}/route.ts
│   ├── components/                 # dashboard/*, ui/* (shadcn)
│   ├── lib/{constants.ts, db/, services/, ids.ts}
│   └── scripts/seed.ts             # seeds the Indonesia-validation example
└── mcp/server.ts                   # FUTURE (documented stub only)
```

## 6. Explicitly NOT in MVP

| Cut | Reason |
|---|---|
| Auth / login | Trusted tool; member-picker cookie; auth_user_id reserved |
| Supabase / hosted DB | Fails zero-setup; schema pg-portable by rule |
| Multi-workspace | Singleton row keeps the door open |
| Realtime sync | Refresh-on-action fine for 5 users |
| Notifications | Staleness badges replace push |
| MCP server | Post-MVP; services make it half a day |
| Comments/chat, files, Gantt, automation, analytics, permissions | Don't affect the 6 questions |
| Version history | activity_log covers it |

Biggest product risk isn't schema — it's `next_action` and `health` rotting from manual upkeep; staleness timestamps are the schema-level hook the UX must exploit.

---

# 追補 — Vercel へ (2026-09-07)

## SQLite → Postgres

Vercel は箱を立てて捨てる作りなので、ファイル(`data/aiment.db`)は使えない。
**書いても消え、2人が同時に開くと別のデータを見る。**

| | 前 | 後 |
|---|---|---|
| DB | better-sqlite3(ファイル) | Postgres(`postgres` + `drizzle-orm/postgres-js`) |
| 呼び出し | 同期 `.all()` / `.get()` / `.run()` | 非同期 `await` **123箇所** |
| マイグレーション | 起動のたびに `migrate()` | `npm run db:migrate`(デプロイ時に1回) |
| 接続 | 都度open | `globalThis` に載せて使い回し、`max: 1` / `prepare: false` |

`prepare: false` は必須。Neon/Supabase の接続プーラ(pgbouncer)は
プリペアドステートメントを跨いで使えない。

**スキーマは無傷で移せた。** 「text / integer / real しか使わない」という
最初の決まりのおかげで、`sqliteTable → pgTable`、`real → doublePrecision` の
機械的な置換だけで済んだ。真偽値が 0/1 の integer なのも同じ理由。

`.all()/.get()/.run()` の変換は正規表現でやったが、**チェーンの後ろに配列メソッドが
続くもの**(`....all().filter(...)`)は `(await ...)` で括り直す必要があり、
そこだけ別のパスで処理した。付け忘れは全部 tsc が拾う。

## ログインは置かない (2026-09-07 変更)

一度 Auth.js + Google + 許可リストまで作ったが、**2人しか使わない**ので外した。
代わりに責任を2つに割った。

| | どこが受け持つか |
|---|---|
| 誰が開けるか | **Vercel の Deployment Protection**(許可メールアドレス)。アプリは関知しない |
| 誰として書くか | `src/lib/accounts.ts` の3アカウント(Soya / Futo / Other)から選ぶ。Cookie 1個 |

- **IDと色を手で固定**した(`mem_soya` / `mem_futo` / `mem_other`)。
  IDをハッシュして色を決めていた頃は、人数が少ないと**2人が同じ色になることがあった**。
  「色=人」が崩れるので、決まった3人は色も直接書く
- `src/middleware.ts` は認証をしない。**未選択なら `/who` へ送るだけ**
- `ensureBaseRows()` がワークスペース1行とアカウント3行を用意する(マイグレーション時に1回)
- E2E は Cookie を直接入れて「Soyaとして」始める

**外したもの:** `next-auth`、`src/auth.ts`、`/login`、`/api/auth/*`、`members.email`、
`AddMember`(メンバーは増えない)、`AUTH_*` の環境変数。

**残した割り切り:** Vercel の保護を切ると全開放になる。アプリ側に第二の鍵は無い。

---

# 追補 — 遠いDBでの遅さ (2026-09-08)

Neon に繋いだ途端「置いた積み木が一瞬消える」「動かすと一度元の位置へ戻る」が出た。
**DBが手元のファイルだった前提のまま書かれていた**のが原因で、3つ別々の問題だった。

## 1. 上書きを消すのが早すぎた(体感のいちばんの原因)

```ts
// 直す前
setPending(moves);
start(async () => {
  await stackBlocksAction(...);
  setPending(null);        // ← サーバーが「書けた」と言った時点で外していた
});
```

サーバーアクションが返ってから、**画面用のデータが届くまでには間がある**。
その隙間で上書きを外すと、届くまでのあいだ古い位置が描かれる = 一瞬ワープする。

直し方: **消さない。** 描くたびに「届いたデータがもう追いついたか」を見て決める。

```ts
const livePending = useMemo(() => {
  if (!pending) return null;
  const caughtUp = pending.every((m) => { /* props と一致したか */ });
  return caughtUp ? null : pending;
}, [pending, serverBlocks]);
```

`useEffect` で `setState` して消す形にすると、届いた瞬間に2度描くことになるうえ
React Compiler にも怒られる。**状態は持つが、有効かどうかは描画時に導出する。**

## 2. 置く・複製・片づけるに上書きが無かった

移動だけ先に見せていて、他は「DBに入る → 取り直す」を待っていた。
`ghosts`(まだ props に無い積み木) と `hidden`(片づけたがまだ props に居る積み木) を足した。

- 置いた瞬間は**仮のID**で出し、本物のIDが返ったら差し替える
- 差し替えるときは `pending` と `selected` の仮IDも**一緒に**付け替える
  (でないと、置いた直後に動かしたとき本物が届いた瞬間に元の位置へ戻る)
- **`hidden` は幻にも効かせる。** 置いた直後の ⌘Z は、消すべき相手が幻のほうにしか居ない

## 3. 1画面につき往復が多すぎた

`getPeriodBoard` が**順番に**10回以上聞いていた。手元のファイルなら1回0.01msなので
誰も気づかなかったが、外のDBでは1往復ぶんの待ちがそのまま積み上がる。

- 互いを待たないものは `Promise.all` で同時に
- 全件取ってJSで絞っていた所を `inArray` の WHERE に(転送量も減る)
- まとめて操作(`MultiToolbar`・Backspace)は**1件ずつ**アクションを呼んでいた。
  選んだ数だけ往復し、そのたび画面を作り直す。`setBlocks*Action` で1回にまとめた

往復1回あたりの待ちを人工的に足して測った実測:

| 1往復 | 直す前 | 直したあと |
|---|---|---|
| 60ms | 641ms | **262ms** |
| 150ms | 1534ms | **620ms** |

## 残っている前提

**アプリ側でどれだけ削っても、往復1回のコストは変えられない。**
Neon のリージョンと Vercel の関数リージョンが離れていると、ここが効く。
ローカル開発は localhost の Postgres のままにしておくこと(Neon を指すと開発中ずっと遅い)。

---

# 追補 — ふたりで同時に見る (2026-09-08)

## 調べたこと: Figmaは「全員いなくなったら書く」をしていない

| | Figma |
|---|---|
| 保持 | サーバーのメモリ(速い) |
| 書き込み① | ジャーナルへ非同期。**変更の95%を約600ms以内** |
| 書き込み② | **30〜60秒ごと**にスナップショット |
| 狙い | 落ちても失うのは**数秒ぶん**まで |

競合の解決は **CRDT風だがCRDTではない**。サーバーが正で、**プロパティ単位の後勝ち**。
文書は `Map<ObjectID, Map<Property, Value>>`、並び順は**分数インデックス**
(0と1の間の分数。間に入れたいときは前後の平均を取る)。親は子側が持つ。

## 採らなかった案:「全員いなくなったらDBに送る」

1. **「全員いなくなった」を検知できない** — 強制終了・スリープ・回線断でブラウザは黙って消える
2. **Vercelには保持する場所が無い** — 箱はリクエストごとに捨てられる。結局どこかに預けることになり、
   手間は減らずに失敗の仕方だけ増える
3. **Figmaもやっていない**(上のとおり)

## ただし「DBに常時通信を乗せない」は正しい

**Neon 無料枠は月100 CU時間**(≒1日3.3時間)。使い切ると**その月の残りはDBが止まる**。
5分で眠る仕様なので普段は問題ないが、「3秒ごとに見に行く」ような作りにすると
タブを開けている間ずっと起きたままになり、2人×8時間で**枠の5倍**。月の途中で止まる。

→ リアルタイムの通信は**DBとは別の線**に流す。

## 採った形

```
誰かが積み木を動かす
  → 画面はすぐ動く            (先に見せる層。実装済み)
  → Postgres に書く            (実装済み)
  → 「変わったよ」と一言流す   ← Liveblocks
  → 相手のブラウザが取り直す
```

**Liveblocks に流すのはカーソルと合図の2つだけ。データ本体は流さない。**
正しいデータの置き場所を Postgres 1つに保つため(MCP/エージェントも同じ所を読む)。

Figma がデータ本体まで同期するのは1ファイルに何千ものオブジェクトがあり全部取り直せないから。
**積み木は数十個**なので取り直しても一瞬で、同じ問題ではない。

- `src/app/api/liveblocks-auth/route.ts` — 選択Cookieを見て通行証を出す。名前と色もここで渡す
- `src/components/board/realtime.tsx` — 部屋・合図・相手のカーソル
- `src/components/board/realtime-bridge.tsx` — Liveblocks の Hook は Room の中でしか動けないので分離
- `src/liveblocks.config.ts` — presence の型

**鍵(`LIVEBLOCKS_SECRET_KEY`)が無くても普通に動く。** その機能が無いだけ。
盤は `realtime` を props で受け、false なら Room ごと描かない(盤の中が if だらけにならない)。

**ループしない理由:** 自分の broadcast は自分には返らない。受け取った側の `router.refresh()` は
`startTransition` の外なので `writing` が動かず、合図を出し返さない。

## 落とし穴: suspense 版の Hook を使わないこと

`@liveblocks/react/suspense` の Hook は**繋がるまで待つ**ので、鍵が間違っていると
盤ごと表示されなくなる。通常版(`@liveblocks/react`)なら未接続でも空で返るだけ。

わざと壊した鍵で確認した結果:

| | |
|---|---|
| 積み木が描かれる | 5個（正常） |
| 選べる・動かせる・置ける | すべて可 |
| 画面のエラー | なし |

**線が死んでも盤は普通に使える**状態を保てている。

## 未検証

Liveblocks の鍵をまだ持っていないので、**実際に2人で繋いだ動作は未確認**。
鍵を入れたあと、2つのブラウザで同じ盤を開いて確かめること。
