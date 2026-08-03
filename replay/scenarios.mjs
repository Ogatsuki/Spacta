/**
 * Eight sessions, built to break the theorem rather than to pass.
 *
 * A cross-check that runs one happy path and reports green is worth nothing: the interesting
 * question is not whether a recording can rebuild a run where nothing overlapped, it is whether
 * it can rebuild the runs where something did. So the list below is mostly races, failures and
 * repetition, and two of them (S2, S3) are run against the loop that existed before the engine
 * as well — where they must fail. A scenario that passes against the old loop is not reproducing
 * the bug the engine was built to close, and would be evidence of nothing.
 *
 * The `update` under test in every one of these is livingdoc's own `core.ts`, unmodified.
 */
import { createIO, DRIVERS } from "./drivers.mjs";

import * as pageview from "../../livingdoc/src/features/pageview/core.ts";
import * as materialrequest from "../../livingdoc/src/features/materialrequest/core.ts";
import * as moderation from "../../livingdoc/src/features/moderation/core.ts";
import * as saved from "../../livingdoc/src/features/saved/core.ts";

// ───────────────────────── fixtures ─────────────────────────
// Fixed values throughout. Nothing here reads a clock or a random source, because these end up
// serialized into `livingdoc/replay-sessions/` and a session file that changes when nothing
// changed is not evidence.

const QUOTE = "Ownership is Rust's most unique feature";
const SPOT = pageview.normalizeQuote(QUOTE);

const READER = { id: "u_reader", username: "reader", avatarUrl: "", role: "user", suspended: false };
const ADMIN = { id: "u_admin", username: "admin", avatarUrl: "", role: "admin", suspended: false };
const AUTHOR = { id: "u_kim", username: "kim", avatarUrl: "" };

const PAGE = {
  materialSlug: "rust-book",
  materialName: "The Rust Programming Language",
  materialCanonicalUrl: "https://doc.rust-lang.org/book/",
  pageId: "p_ownership",
  pageSlug: "ch04-01",
  pageNumber: "4.1",
  pageTitle: "What is Ownership?",
  canonicalUrl: "https://doc.rust-lang.org/book/ch04-01-what-is-ownership.html",
};

function pageviewInit(now = "2026-07-26T09:00:00.000Z") {
  return {
    now,
    viewer: READER,
    page: PAGE,
    traces: [
      {
        id: "t_borrow",
        pageId: "p_ownership",
        type: "stuck",
        quote: QUOTE,
        quoteKey: SPOT,
        body: "I read this three times and still could not say what a move is.",
        author: AUTHOR,
        createdAt: "2026-07-25T12:00:00.000Z",
        votes: 2,
        viewerVoted: false,
        comments: [
          {
            id: "cm_move",
            traceId: "t_borrow",
            body: "A move is an assignment that also ends the old name.",
            author: AUTHOR,
            createdAt: "2026-07-25T13:00:00.000Z",
            votes: 1,
            viewerVoted: false,
          },
        ],
      },
    ],
    prev: null,
    next: null,
    loginHref: "/login",
  };
}

/** A saved-list row. `TraceWithPage` — the trace plus where it lives, since it is shown off its page. */
function savedItem(id, createdAt) {
  return {
    trace: {
      id,
      pageId: "p_ownership",
      type: "insight",
      quote: "",
      quoteKey: "",
      body: `Saved trace ${id}.`,
      author: AUTHOR,
      createdAt,
      votes: 0,
      viewerVoted: false,
      bookmarked: true,
      comments: [],
    },
    page: PAGE,
  };
}

const feature = {
  pageview: (now) => ({ init: pageview.init, update: pageview.update, initData: pageviewInit(now) }),
  /**
   * The read-later list, seeded with one page and told there is another. `hasMore` is the
   * server's count, not a guess: Core refuses to ask for a page it was not told exists, which
   * is what S9 leans on when it clicks twice.
   */
  saved: () => ({
    init: saved.init,
    update: saved.update,
    initData: {
      now: "2026-07-26T09:00:00.000Z",
      viewer: READER,
      items: [savedItem("t_s1", "2026-07-25T10:00:00.000Z"), savedItem("t_s2", "2026-07-25T09:00:00.000Z")],
      hasMore: true,
    },
  }),
  materialrequest: () => ({
    init: materialrequest.init,
    update: materialrequest.update,
    initData: { viewer: READER, loginHref: "/login" },
  }),
  moderation: () => ({
    init: moderation.init,
    update: moderation.update,
    initData: {
      now: "2026-07-26T09:00:00.000Z",
      viewer: ADMIN,
      reports: [
        {
          id: "r_1",
          targetType: "trace",
          targetId: "t_spam",
          reason: "advertising",
          createdAt: "2026-07-26T08:00:00.000Z",
          reporter: AUTHOR,
          targetBody: "buy followers",
          targetAuthor: { id: "u_spam", username: "spam", avatarUrl: "" },
          targetHidden: false,
        },
      ],
      requests: [
        {
          id: "q_1",
          name: "Crafting Interpreters",
          url: "https://craftinginterpreters.com",
          note: "",
          status: "open",
          createdAt: "2026-07-26T07:00:00.000Z",
          requester: AUTHOR,
        },
      ],
      users: [{ id: "u_spam", username: "spam", avatarUrl: "", traceCount: 4, suspended: false }],
    },
  }),
};

const vote = (correlationId, targetId = "t_borrow", targetType = "trace") => ({
  type: "TOGGLE_VOTE",
  targetType,
  targetId,
  correlationId,
});

/** Open the composer, type, post. Three Actions, because that is what a reader does. */
function post(driver, { now, tempId, correlationId, body, quote = QUOTE }) {
  driver.dispatch({ type: "OPEN_COMPOSER", quote });
  driver.rerender();
  driver.dispatch({ type: "SET_DRAFT_BODY", value: body });
  driver.rerender();
  driver.dispatch({ type: "SUBMIT_TRACE", now, tempId, correlationId });
}

// ───────────────────────── the scenarios ─────────────────────────

export const SCENARIOS = [
  {
    id: "S1",
    title: "simple serial operation (post → display)",
    aims: "(2)(3)",
    drivers: ["engine"],
    features: () => ({ pageview: feature.pageview() }),
    async script(d, io) {
      post(d.pageview, {
        now: "2026-07-26T09:01:00.000Z",
        tempId: "temp_a1",
        correlationId: "c_a1",
        body: "It clicked when I stopped thinking about the stack.",
      });
      await io.settleAll({ outcome: () => ({ id: "srv_trace_a1" }) });
      d.pageview.rerender();
      d.pageview.dispatch({ type: "TOGGLE_SPOT", key: SPOT });
    },
  },

  {
    id: "S2",
    title: "vote hammering (same target, three times, no repaint between)",
    aims: "(2)",
    // Both drivers. The old loop must lose votes here; if it ever stops losing them, the
    // scenario has stopped reproducing the bug and needs rebuilding, not accepting.
    drivers: ["engine", "legacy"],
    features: () => ({ pageview: feature.pageview() }),
    async script(d, io) {
      const p = d.pageview;
      p.dispatch(vote("c_v1"));
      p.dispatch(vote("c_v2"));
      p.dispatch(vote("c_v3"));
      await io.settleAll({ order: "reverse" });
    },
  },

  {
    id: "S3",
    title: "vote overlapping a post (dispatch while a write is in flight)",
    aims: "(2)",
    drivers: ["engine", "legacy"],
    features: () => ({ pageview: feature.pageview() }),
    async script(d, io) {
      const p = d.pageview;
      post(p, {
        now: "2026-07-26T09:02:00.000Z",
        tempId: "temp_b1",
        correlationId: "c_b1",
        body: "Moves are assignments that end the old name.",
      });
      // The save has left. React has painted by now — the optimistic trace is on screen — so a
      // click at this moment reads the fresh state, and the loss will happen on the way back.
      await io.waitFor(1);
      p.rerender();
      p.dispatch(vote("c_b2"));
      await io.settleAll({ order: "reverse" });
    },
  },

  {
    id: "S4",
    title: "injected write failure (the server returns 500)",
    aims: "(2)(3)",
    drivers: ["engine"],
    features: () => ({ pageview: feature.pageview() }),
    async script(d, io) {
      post(d.pageview, {
        now: "2026-07-26T09:03:00.000Z",
        tempId: "temp_c1",
        correlationId: "c_c1",
        body: "This one never reaches the database.",
      });
      await io.settleAll({ outcome: () => ({ fail: "Request failed (500)" }) });
    },
  },

  {
    id: "S5",
    title: "success and failure mixed (the second of three writes fails)",
    aims: "(2)",
    drivers: ["engine"],
    features: () => ({ pageview: feature.pageview() }),
    async script(d, io) {
      const p = d.pageview;
      for (const n of [1, 2, 3]) {
        post(p, {
          now: `2026-07-26T09:0${3 + n}:00.000Z`,
          tempId: `temp_d${n}`,
          correlationId: `c_d${n}`,
          body: `Attempt number ${n} at saying what a move is.`,
        });
        p.rerender();
      }
      await io.settleAll({
        outcome: (index) =>
          index === 1 ? { fail: "Request failed (500)" } : { id: `srv_trace_d${index + 1}` },
      });
    },
  },

  {
    id: "S6",
    title: "an operation crossing a time boundary (either side of midnight)",
    aims: "(3)",
    drivers: ["engine"],
    features: () => ({ pageview: feature.pageview("2026-07-26T23:59:50.000Z") }),
    async script(d, io) {
      const p = d.pageview;
      post(p, {
        now: "2026-07-26T23:59:58.000Z",
        tempId: "temp_e1",
        correlationId: "c_e1",
        body: "Written on the twenty-sixth, by two seconds.",
      });
      await io.settleAll({ outcome: () => ({ id: "srv_trace_e1" }) });
      p.rerender();
      post(p, {
        now: "2026-07-27T00:00:01.000Z",
        tempId: "temp_e2",
        correlationId: "c_e2",
        body: "Written on the twenty-seventh, by one.",
      });
      await io.settleAll({ outcome: () => ({ id: "srv_trace_e2" }) });
    },
  },

  {
    id: "S7",
    title: "three features driven in one session",
    aims: "(1)",
    drivers: ["engine"],
    // Each feature gets its own runtime, its own recorder and its own session file, and each is
    // replayed alone. Whether a feature's behaviour is its own is exactly what that tests.
    features: () => ({
      pageview: feature.pageview(),
      materialrequest: feature.materialrequest(),
      moderation: feature.moderation(),
    }),
    async script(d, io) {
      d.pageview.dispatch(vote("c_f1"));
      d.materialrequest.dispatch({ type: "SET_NAME", value: "Crafting Interpreters" });
      d.moderation.dispatch({ type: "SET_TAB", tab: "requests" });
      d.materialrequest.dispatch({ type: "SET_URL", value: "https://craftinginterpreters.com" });
      d.pageview.dispatch({ type: "OPEN_REPORT", targetType: "comment", targetId: "cm_move" });
      d.materialrequest.dispatch({ type: "SUBMIT" });
      d.moderation.dispatch({ type: "RUN", correlationId: "c_f3", command: { command: "approve-request", targetId: "q_1" } });
      d.pageview.dispatch({ type: "SET_REPORT_REASON", value: "off topic" });
      d.pageview.dispatch({ type: "SUBMIT_REPORT", correlationId: "c_f2" });
      // Reverse settlement is possible here in a way it is not within one feature: three engines
      // mean three Effects can be outstanding at once.
      await io.settleAll({ order: "reverse" });
    },
  },

  {
    id: "S9",
    title: "a moderation command the server rejects (the console must put the row back)",
    aims: "(2)",
    drivers: ["engine"],
    // Until v0.11 `MODERATE` carried no `correlationId`, so an answer could not name the command
    // it belonged to: a success dropped nothing from `pending` and a failure dropped everything
    // without undoing anything, leaving an approval on screen under a notice saying it had
    // failed. This scenario drives that exact path. The cross-check proves the compensating run
    // replays; `runtime.serialization.test.mjs` asserts that what it compensates *to* is right.
    features: () => ({ moderation: feature.moderation() }),
    async script(d, io) {
      d.moderation.dispatch({
        type: "RUN",
        correlationId: "c_m1",
        command: { command: "approve-request", targetId: "q_1" },
      });
      await io.settleAll({ outcome: () => ({ fail: "Request failed (500)" }) });
      // A second command, so the failure above is shown not to have emptied the queue for a
      // write that has nothing to do with it — the bug the old wholesale clear had.
      d.moderation.dispatch({
        type: "RUN",
        correlationId: "c_m2",
        command: { command: "suspend-user", targetId: "u_spam" },
      });
      await io.settleAll();
    },
  },

  {
    id: "S8",
    title: "the same Action list replayed twice",
    aims: "(3)",
    drivers: ["engine"],
    // The live run is ordinary; the check is that two independent replays of its recording agree
    // with each other as well as with it. They cannot share so much as an object: each replay
    // parses the session again from JSON.
    replays: 2,
    features: () => ({ pageview: feature.pageview() }),
    async script(d, io) {
      const p = d.pageview;
      post(p, {
        now: "2026-07-26T09:10:00.000Z",
        tempId: "temp_g1",
        correlationId: "c_g1",
        body: "A trace that will be saved, then voted on, then reported.",
      });
      await io.settleAll({ outcome: () => ({ id: "srv_trace_g1" }) });
      p.rerender();
      p.dispatch(vote("c_g2", "srv_trace_g1"));
      p.dispatch({ type: "OPEN_REPORT", targetType: "trace", targetId: "t_borrow" });
      p.dispatch({ type: "SET_REPORT_REASON", value: "duplicate" });
      p.dispatch({ type: "SUBMIT_REPORT", correlationId: "c_g3" });
      await io.settleAll({ outcome: () => ({ fail: "Request failed (500)" }) });
    },
  },

  {
    id: "S10",
    title: "a read after the page has loaded (load more, then remove from the page it brought)",
    aims: "(2)(3)",
    drivers: ["engine"],
    // Every other scenario answers a write with an id. This one answers a *read* with rows, so
    // it is the only place the `data` channel is exercised end to end: Effect out, page back,
    // appended by Core, recorded, replayed. The removal afterwards matters as much as the load —
    // it acts on a trace that was never in `initData`, so a replay that rebuilt the list wrongly
    // cannot settle to the same state.
    features: () => ({ saved: feature.saved() }),
    async script(d, io) {
      const s = d.saved;
      s.dispatch({ type: "LOAD_MORE", correlationId: "c_s1" });
      // A second click while the first page is away. Core holds a `load` in `pending` and must
      // refuse: two pages asked from one cursor would append the same rows twice.
      s.dispatch({ type: "LOAD_MORE", correlationId: "c_s2" });
      await io.settleAll({
        outcome: () => ({
          data: {
            of: "LOAD_MORE",
            traces: [savedItem("t_s3", "2026-07-25T08:00:00.000Z")],
            hasMore: false,
          },
        }),
      });
      s.rerender();
      // Remove the trace the read brought back, and let that write fail: the compensation has to
      // put back an item that only ever existed as the answer to an Effect.
      s.dispatch({ type: "REMOVE_BOOKMARK", traceId: "t_s3", correlationId: "c_s3" });
      await io.settleAll({ outcome: () => ({ fail: "Request failed (500)" }) });
    },
  },
];

// ───────────────────────── running one ─────────────────────────

/**
 * Perform the live run of a scenario against one driver, and hand back what the cross-check
 * needs: per feature, the session that was recorded and the states the run actually held.
 */
export async function runScenario(scenario, driverName) {
  const io = createIO();
  const built = scenario.features();
  const drivers = {};
  for (const [name, parts] of Object.entries(built)) {
    drivers[name] = DRIVERS[driverName]({ ...parts, perform: io.perform });
  }

  await scenario.script(drivers, io);
  await io.quiet();

  const results = {};
  for (const [name, parts] of Object.entries(built)) {
    results[name] = {
      init: parts.init,
      update: parts.update,
      session: drivers[name].session(),
      live: drivers[name].live(),
    };
  }
  return { io, results };
}
