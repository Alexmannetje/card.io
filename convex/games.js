import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";

const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K"];
const SUITS = ["S", "H", "D", "C"]; // Spades, Hearts, Diamonds, Clubs
// For play comparison: 2 highest, then A, K... 3 lowest. Lower index = higher rank.
const RANK_ORDER = ["2", "A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3"];

function rankValue(rank) {
  const i = RANK_ORDER.indexOf(rank);
  return i < 0 ? 999 : i;
}

function buildDeck(deckCount) {
  const deck = [];
  for (let d = 0; d < deckCount; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push(rank + suit);
      }
    }
  }
  return deck;
}

function shuffleArray(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Distribute cards evenly. Returns array of hands (each hand is array of card ids). */
function distributeEvenly(deck, numPlayers) {
  const total = deck.length;
  const baseCount = Math.floor(total / numPlayers);
  const remainder = total % numPlayers;
  const hands = [];
  let idx = 0;
  for (let p = 0; p < numPlayers; p++) {
    const count = baseCount + (p < remainder ? 1 : 0);
    hands.push(deck.slice(idx, idx + count));
    idx += count;
  }
  return hands;
}

/** Sort hand by rank (best first: 2, A, K... 3). */
function sortHandByRank(hand) {
  return [...hand].sort((a, b) => rankValue(a[0]) - rankValue(b[0]));
}

/** Pick the n best cards (highest rank). */
function pickBest(hand, n) {
  const sorted = sortHandByRank(hand);
  return sorted.slice(0, Math.min(n, sorted.length));
}

/** Pick the n worst cards (lowest rank). */
function pickWorst(hand, n) {
  const sorted = sortHandByRank(hand);
  return sorted.slice(-Math.min(n, sorted.length));
}

function removeCards(hand, cardsToRemove) {
  const set = new Set(cardsToRemove);
  return hand.filter((c) => !set.has(c));
}

export const startGame = mutation({
  args: {
    code: v.string(),
    username: v.string(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();

    if (!room) {
      throw new ConvexError("Room not found");
    }

    if (room.status === "in_progress") {
      throw new ConvexError("A game is already in progress");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", args.username))
      .first();

    if (!user) {
      throw new ConvexError("User not found");
    }

    const member = await ctx.db
      .query("roomMembers")
      .withIndex("by_room_and_user", (q) =>
        q.eq("roomId", room._id).eq("userId", user._id),
      )
      .first();

    if (!member || member.role !== "admin") {
      throw new ConvexError("Only the host can start the game");
    }

    const members = await ctx.db
      .query("roomMembers")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .collect();

    if (members.length < 2) {
      throw new ConvexError("Need at least 2 players to start");
    }

    if (room.gameMode !== "presidents") {
      throw new ConvexError("Only Presidents mode can be started. Select Presidents in room settings.");
    }

    const deckCount = Math.max(1, room.deckCount ?? 1);
    const fullDeck = buildDeck(deckCount);
    const shuffled = shuffleArray(fullDeck);
    const hands = distributeEvenly(shuffled, members.length);

    const now = Date.now();
    const gameId = await ctx.db.insert("games", {
      roomId: room._id,
      status: "active",
      winnerId: undefined,
      gameMode: room.gameMode,
      timeLimitSeconds: room.timeLimitSeconds,
      startedAt: now,
      endedAt: undefined,
    });

    const sortedMembers = [...members].sort(
      (a, b) => (a.seatIndex ?? 999) - (b.seatIndex ?? 999),
    );

    for (let i = 0; i < sortedMembers.length; i++) {
      await ctx.db.insert("gamePlayers", {
        gameId,
        userId: sortedMembers[i].userId,
        seatIndex: i,
        finalScore: undefined,
        placement: undefined,
        isEliminated: false,
        hand: hands[i],
      });
    }

    const firstUserId = sortedMembers[0].userId;
    await ctx.db.insert("gameStates", {
      gameId,
      currentTurnUserId: firstUserId,
      turnNumber: 0,
      turnStartedAt: now,
      deck: [],
      discardPile: [],
      direction: "clockwise",
      phase: "play",
      lastAction: undefined,
      lastPlayedCount: 0,
      lastPlayedRank: undefined,
      lastPlayedBy: undefined,
      passedUserIds: [],
    });

    await ctx.db.patch(room._id, {
      status: "in_progress",
      startedAt: now,
    });

    return { gameId };
  },
});

export const getGameByRoomCode = query({
  args: {
    code: v.string(),
    username: v.string(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();

    if (!room) return null;

    const game = await ctx.db
      .query("games")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    if (!game) return null;

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", args.username))
      .first();

    if (!currentUser) return null;

    const gamePlayers = await ctx.db
      .query("gamePlayers")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect();

    const userIds = gamePlayers.map((p) => p.userId);
    const users = await Promise.all(userIds.map((id) => ctx.db.get(id)));
    const usersById = new Map(users.filter(Boolean).map((u) => [u._id, u]));

    const gameState = await ctx.db
      .query("gameStates")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .first();

    const roomMember = await ctx.db
      .query("roomMembers")
      .withIndex("by_room_and_user", (q) =>
        q.eq("roomId", room._id).eq("userId", currentUser._id),
      )
      .first();
    const isHost = roomMember?.role === "admin";

    const totalCards = gamePlayers.reduce((sum, p) => sum + p.hand.length, 0);
    const deckCount = Math.ceil(totalCards / 52) || 1;

    const players = gamePlayers.map((gp) => {
      const u = usersById.get(gp.userId);
      if (!u) return null;
      const isCurrentUser = gp.userId === currentUser._id;
      return {
        id: gp._id,
        userId: gp.userId,
        username: u.username,
        seatIndex: gp.seatIndex,
        handCount: gp.hand.length,
        hand: isCurrentUser ? gp.hand : undefined,
        isCurrentUser,
      };
    }).filter(Boolean);

    return {
      game,
      players,
      gameState,
      deckCount,
      totalCards,
      isHost,
    };
  },
});

function getNextPlayer(gamePlayers, currentUserId) {
  const sorted = [...gamePlayers].sort((a, b) => a.seatIndex - b.seatIndex);
  const idx = sorted.findIndex((p) => p.userId === currentUserId);
  if (idx < 0) return sorted[0].userId;
  return sorted[(idx + 1) % sorted.length].userId;
}

/** Next player in order who can play: not passed and has cards (not a spectator). Returns null if no one can play. */
function getNextPlayerToPlay(gamePlayers, currentUserId, passedUserIds, skipUserIdsOrZeroCardMap) {
  const sorted = [...gamePlayers].sort((a, b) => a.seatIndex - b.seatIndex);
  const idx = sorted.findIndex((p) => p.userId === currentUserId);
  if (idx < 0) return sorted[0].userId;
  const passedSet = new Set(passedUserIds ?? []);
  const skipSet = skipUserIdsOrZeroCardMap instanceof Set
    ? skipUserIdsOrZeroCardMap
    : new Set();
  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[(idx + i) % sorted.length];
    if (next.userId !== currentUserId && !passedSet.has(next.userId) && !skipSet.has(next.userId)) return next.userId;
  }
  return null;
}

export const playCards = mutation({
  args: {
    code: v.string(),
    username: v.string(),
    cardIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.cardIds.length === 0) {
      throw new ConvexError("Select at least one card to play");
    }
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();
    if (!room) throw new ConvexError("Room not found");
    const user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", args.username))
      .first();
    if (!user) throw new ConvexError("User not found");
    const game = await ctx.db
      .query("games")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();
    if (!game) throw new ConvexError("Game not found");
    if (game.gameMode !== "presidents") {
      throw new ConvexError("This game is not Presidents mode");
    }
    const gameState = await ctx.db
      .query("gameStates")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .first();
    if (!gameState || gameState.phase === "round_ended" || gameState.phase === "exchange") {
      throw new ConvexError(gameState?.phase === "exchange" ? "Complete the card exchange first" : "Round has ended; wait for the host to restart");
    }
    if (gameState.currentTurnUserId !== user._id) {
      throw new ConvexError("Not your turn");
    }
    const gamePlayers = await ctx.db
      .query("gamePlayers")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect();
    const gp = gamePlayers.find((p) => p.userId === user._id);
    if (!gp) throw new ConvexError("You are not in this game");
    const hand = [...gp.hand];
    for (const cid of args.cardIds) {
      const i = hand.indexOf(cid);
      if (i < 0) throw new ConvexError("Card not in hand");
      hand.splice(i, 1);
    }
    const ranks = args.cardIds.map((id) => id[0]);
    const twos = ranks.filter((r) => r === "2");
    const nonTwos = ranks.filter((r) => r !== "2");
    if (twos.length === args.cardIds.length) {
      throw new ConvexError("2 cannot be played alone (joker must go with another rank)");
    }
    const uniqueNonTwo = [...new Set(nonTwos)];
    if (uniqueNonTwo.length > 1) {
      throw new ConvexError("Play same rank only (2 counts as joker)");
    }
    const playRank = uniqueNonTwo.length ? uniqueNonTwo[0] : "2";
    const lastCount = gameState.lastPlayedCount ?? 0;
    const lastRank = gameState.lastPlayedRank ?? null;
    if (lastCount > 0) {
      if (args.cardIds.length < lastCount) {
        throw new ConvexError(`Play at least ${lastCount} card(s)`);
      }
      if (rankValue(playRank) > rankValue(lastRank)) {
        throw new ConvexError("Play same or higher rank");
      }
    }
    const newHand = hand;
    await ctx.db.patch(gp._id, { hand: newHand });
    const passedUserIds = gameState.passedUserIds ?? [];
    const discardPile = [...(gameState.discardPile ?? []), ...args.cardIds];
    let finishedOrder = gameState.finishedOrder ?? [];
    if (newHand.length === 0 && !finishedOrder.includes(user._id)) {
      finishedOrder = [...finishedOrder, user._id];
    }
    const playerJustFinished = newHand.length === 0;
    const zeroCardUserIds = gamePlayers
      .filter((p) => (p._id === gp._id ? newHand.length : p.hand.length) === 0)
      .map((p) => p.userId);
    const skipSpectators = new Set(zeroCardUserIds);
    const nextUserIdRaw = getNextPlayerToPlay(gamePlayers, user._id, passedUserIds, skipSpectators);
    const samePlayerLeadsAgain = nextUserIdRaw === null;
    const nextUserId = nextUserIdRaw !== null ? nextUserIdRaw : user._id;

    const playersWithCards = gamePlayers.map((p) =>
      p._id === gp._id ? newHand.length : p.hand.length
    ).filter((c) => c > 0).length;
    const onlyOneHasCards = playersWithCards === 1;

    if (playerJustFinished && onlyOneHasCards) {
      const roundLoserId = gamePlayers.find((p) => (p._id === gp._id ? newHand.length : p.hand.length) > 0)?.userId;
      const finishedOrderWithLoser = roundLoserId ? [...finishedOrder, roundLoserId] : finishedOrder;
      await ctx.db.patch(gameState._id, {
        phase: "round_ended",
        finishedOrder: finishedOrderWithLoser,
        roundLoserId,
        currentTurnUserId: nextUserId,
        discardPile,
        lastPlayedCount: 0,
        lastPlayedRank: undefined,
        lastPlayedBy: undefined,
        turnNumber: gameState.turnNumber + 1,
        turnStartedAt: Date.now(),
      });
    } else {
      const clearTable = playerJustFinished || samePlayerLeadsAgain;
      await ctx.db.patch(gameState._id, {
        currentTurnUserId: nextUserId,
        lastPlayedCount: clearTable ? 0 : args.cardIds.length,
        lastPlayedRank: clearTable ? undefined : playRank,
        lastPlayedBy: clearTable ? undefined : user._id,
        discardPile: clearTable ? [] : discardPile,
        turnNumber: gameState.turnNumber + 1,
        turnStartedAt: Date.now(),
        ...((samePlayerLeadsAgain || playerJustFinished) ? { passedUserIds: [] } : {}),
        ...(finishedOrder.length > 0 ? { finishedOrder } : {}),
      });
    }
  },
});

export const pass = mutation({
  args: {
    code: v.string(),
    username: v.string(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();
    if (!room) throw new ConvexError("Room not found");
    const user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", args.username))
      .first();
    if (!user) throw new ConvexError("User not found");
    const game = await ctx.db
      .query("games")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();
    if (!game) throw new ConvexError("Game not found");
    if (game.gameMode !== "presidents") {
      throw new ConvexError("This game is not Presidents mode");
    }
    const gameState = await ctx.db
      .query("gameStates")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .first();
    if (!gameState || gameState.phase === "round_ended" || gameState.phase === "exchange") {
      throw new ConvexError(gameState?.phase === "exchange" ? "Complete the card exchange first" : "Round has ended; wait for the host to restart");
    }
    if (gameState.currentTurnUserId !== user._id) {
      throw new ConvexError("Not your turn");
    }
    const lastPlayedCount = gameState.lastPlayedCount ?? 0;
    if (lastPlayedCount === 0) {
      throw new ConvexError("You must lead; you cannot pass");
    }
    const gamePlayers = await ctx.db
      .query("gamePlayers")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect();
    const passedUserIds = [...(gameState.passedUserIds ?? []), user._id];
    const lastPlayedBy = gameState.lastPlayedBy ?? null;
    const numPlayers = gamePlayers.length;
    const zeroCardUserIds = gamePlayers.filter((p) => p.hand.length === 0).map((p) => p.userId);
    const skipSpectators = new Set(zeroCardUserIds);
    const nextUserId = getNextPlayerToPlay(gamePlayers, user._id, passedUserIds, skipSpectators);
    if (nextUserId === null) {
      // Everyone passed — shouldn't happen; fallback to lastPlayedBy leading
      await ctx.db.patch(gameState._id, {
        currentTurnUserId: lastPlayedBy,
        lastPlayedCount: 0,
        lastPlayedRank: undefined,
        lastPlayedBy: undefined,
        passedUserIds: [],
        turnNumber: gameState.turnNumber + 1,
        turnStartedAt: Date.now(),
      });
    } else if (lastPlayedBy !== null && nextUserId === lastPlayedBy && passedUserIds.length >= numPlayers - 1) {
      await ctx.db.patch(gameState._id, {
        currentTurnUserId: lastPlayedBy,
        lastPlayedCount: 0,
        lastPlayedRank: undefined,
        lastPlayedBy: undefined,
        passedUserIds: [],
        turnNumber: gameState.turnNumber + 1,
        turnStartedAt: Date.now(),
      });
    } else {
      await ctx.db.patch(gameState._id, {
        currentTurnUserId: nextUserId,
        passedUserIds,
        turnNumber: gameState.turnNumber + 1,
        turnStartedAt: Date.now(),
      });
    }
  },
});

export const restartRound = mutation({
  args: {
    code: v.string(),
    username: v.string(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();
    if (!room) throw new ConvexError("Room not found");
    const user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", args.username))
      .first();
    if (!user) throw new ConvexError("User not found");
    const member = await ctx.db
      .query("roomMembers")
      .withIndex("by_room_and_user", (q) =>
        q.eq("roomId", room._id).eq("userId", user._id),
      )
      .first();
    if (!member || member.role !== "admin") {
      throw new ConvexError("Only the host can restart the round");
    }
    const game = await ctx.db
      .query("games")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();
    if (!game) throw new ConvexError("Game not found");
    if (game.gameMode !== "presidents") {
      throw new ConvexError("This game is not Presidents mode");
    }
    const gameState = await ctx.db
      .query("gameStates")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .first();
    if (!gameState || gameState.phase !== "round_ended") {
      throw new ConvexError("Round has not ended");
    }
    const gamePlayers = await ctx.db
      .query("gamePlayers")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect();
    const finishedOrder = gameState.finishedOrder ?? [];
    const n = gamePlayers.length;
    const firstLeaderId = finishedOrder.length > 0 ? finishedOrder[0] : gamePlayers.sort((a, b) => a.seatIndex - b.seatIndex)[0].userId;

    const allCards = [
      ...gamePlayers.flatMap((p) => p.hand),
      ...(gameState.discardPile ?? []),
    ];
    const shuffled = shuffleArray(allCards);
    const hands = distributeEvenly(shuffled, n);

    const sortedPlayers = [...gamePlayers].sort((a, b) => a.seatIndex - b.seatIndex);
    const playerIdxByUserId = new Map(sortedPlayers.map((p, i) => [p.userId, i]));

    // Playing order = position in last round (winner first). Reassign seatIndex and assign hands by finishedOrder.
    const newHandsByOrder = finishedOrder.length === n
      ? finishedOrder.map((userId) => hands[playerIdxByUserId.get(userId)] ?? [])
      : hands;
    for (let i = 0; i < n; i++) {
      const userId = finishedOrder.length === n ? finishedOrder[i] : sortedPlayers[i].userId;
      const gp = gamePlayers.find((p) => p.userId === userId);
      if (!gp) continue;
      const hand = finishedOrder.length === n ? newHandsByOrder[i] : hands[i];
      await ctx.db.patch(gp._id, { seatIndex: i, hand });
    }

    // Build exchange pairs: 2–3 swap 1 each; 4+ first↔last 2, second↔second-last 1
    let exchangePairs = [];
    if (finishedOrder.length >= n) {
      if (n === 2 || n === 3) {
        const winnerId = finishedOrder[0];
        const loserId = finishedOrder[n - 1];
        exchangePairs = [
          { fromUserId: loserId, toUserId: winnerId, count: 1 },
          { fromUserId: winnerId, toUserId: loserId, count: 1 },
        ];
      } else if (n >= 4) {
        const firstId = finishedOrder[0];
        const lastId = finishedOrder[n - 1];
        const secondId = finishedOrder[1];
        const secondLastId = finishedOrder[n - 2];
        exchangePairs = [
          { fromUserId: firstId, toUserId: lastId, count: 2 },
          { fromUserId: lastId, toUserId: firstId, count: 2 },
          { fromUserId: secondId, toUserId: secondLastId, count: 1 },
          { fromUserId: secondLastId, toUserId: secondId, count: 1 },
        ];
      }
    }

    const now = Date.now();
    await ctx.db.patch(gameState._id, {
      phase: exchangePairs.length > 0 ? "exchange" : "play",
      currentTurnUserId: firstLeaderId,
      turnNumber: gameState.turnNumber + 1,
      turnStartedAt: now,
      discardPile: [],
      lastPlayedCount: 0,
      lastPlayedRank: undefined,
      lastPlayedBy: undefined,
      passedUserIds: [],
      finishedOrder: undefined,
      roundLoserId: undefined,
      exchangePairs: exchangePairs.length > 0 ? exchangePairs : undefined,
      exchangeSelections: [],
      roundLeaderId: exchangePairs.length > 0 ? firstLeaderId : undefined,
    });
  },
});

export const submitExchangeSelection = mutation({
  args: {
    code: v.string(),
    username: v.string(),
    cardIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();
    if (!room) throw new ConvexError("Room not found");
    const user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", args.username))
      .first();
    if (!user) throw new ConvexError("User not found");
    const game = await ctx.db
      .query("games")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();
    if (!game) throw new ConvexError("Game not found");
    if (game.gameMode !== "presidents") {
      throw new ConvexError("This game is not Presidents mode");
    }
    const gameState = await ctx.db
      .query("gameStates")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .first();
    if (!gameState || gameState.phase !== "exchange") {
      throw new ConvexError("Not in exchange phase");
    }
    const exchangePairs = gameState.exchangePairs ?? [];
    const myPair = exchangePairs.find((p) => p.fromUserId === user._id);
    if (!myPair) throw new ConvexError("You are not giving cards in this exchange");
    if (args.cardIds.length !== myPair.count) {
      throw new ConvexError(`Select exactly ${myPair.count} card(s) to give`);
    }
    const gamePlayers = await ctx.db
      .query("gamePlayers")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect();
    const gp = gamePlayers.find((p) => p.userId === user._id);
    if (!gp) throw new ConvexError("You are not in this game");
    const handSet = new Set(gp.hand);
    for (const cid of args.cardIds) {
      if (!handSet.has(cid)) throw new ConvexError("Selected card not in your hand");
    }

    const existing = gameState.exchangeSelections ?? [];
    const withoutMe = existing.filter((s) => s.fromUserId !== user._id);
    const newSelections = [...withoutMe, { fromUserId: user._id, cardIds: args.cardIds }];

    const allIn = exchangePairs.every((p) => {
      const sel = newSelections.find((s) => s.fromUserId === p.fromUserId);
      return sel && sel.cardIds.length === p.count;
    });

    if (allIn) {
      const handsByUserId = new Map(gamePlayers.map((p) => [p.userId, [...p.hand]]));
      for (const p of exchangePairs) {
        const sel = newSelections.find((s) => s.fromUserId === p.fromUserId);
        if (!sel || sel.cardIds.length !== p.count) continue;
        const fromHand = handsByUserId.get(p.fromUserId) ?? [];
        const toHand = handsByUserId.get(p.toUserId) ?? [];
        const set = new Set(sel.cardIds);
        handsByUserId.set(p.fromUserId, fromHand.filter((c) => !set.has(c)));
        handsByUserId.set(p.toUserId, [...toHand, ...sel.cardIds]);
      }
      for (const gp of gamePlayers) {
        const hand = handsByUserId.get(gp.userId) ?? gp.hand;
        await ctx.db.patch(gp._id, { hand });
      }
      const now = Date.now();
      await ctx.db.patch(gameState._id, {
        phase: "play",
        currentTurnUserId: gameState.roundLeaderId,
        turnNumber: gameState.turnNumber + 1,
        turnStartedAt: now,
        exchangePairs: undefined,
        exchangeSelections: undefined,
        roundLeaderId: undefined,
      });
    } else {
      await ctx.db.patch(gameState._id, { exchangeSelections: newSelections });
    }
  },
});
