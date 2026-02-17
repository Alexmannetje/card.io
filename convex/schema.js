import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({

  // ─── USERS ───────────────────────────────────────────────────────────────
  users: defineTable({
    // Auth
    clerkId: v.string(),             // or any auth provider ID
    email: v.string(),
    username: v.string(),
    avatarUrl: v.optional(v.string()),

    // Profile stats
    gamesPlayed: v.number(),
    gamesWon: v.number(),
    gamesLost: v.number(),

    createdAt: v.number(),           // timestamp
    lastSeenAt: v.number(),          // timestamp
  })
    .index("by_clerkId", ["clerkId"])
    .index("by_username", ["username"])
    .index("by_email", ["email"]),


  // ─── ROOMS ───────────────────────────────────────────────────────────────
  rooms: defineTable({
    // Identity
    code: v.string(),                // e.g. "XKQT29" - the join code
    name: v.string(),                // display name of the room

    // Ownership
    adminId: v.id("users"),          // user who created and controls the room

    // Settings (admin can change these)
    gameMode: v.union(
      v.literal("classic"),
      v.literal("speed"),
      v.literal("tournament"),
      v.literal("custom"),
      v.literal("chaos"),
      v.literal("presidents"),
    ),
    maxPlayers: v.number(),          // e.g. 2, 4, 6, 8
    deckCount: v.optional(v.number()), // number of decks for some modes (e.g. Presidents)
    timeLimitSeconds: v.optional(v.number()), // null = no time limit

    // State
    status: v.union(
      v.literal("waiting"),          // in lobby, waiting for players
      v.literal("starting"),         // countdown before game begins
      v.literal("in_progress"),      // game is actively running
      v.literal("finished"),         // game has ended
    ),

    isPrivate: v.boolean(),          // private = only joinable via code
    password: v.optional(v.string()), // optional room password

    createdAt: v.number(),
    startedAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
  })
    .index("by_code", ["code"])
    .index("by_admin", ["adminId"])
    .index("by_status", ["status"]),


  // ─── ROOM MEMBERS ────────────────────────────────────────────────────────
  roomMembers: defineTable({
    roomId: v.id("rooms"),
    userId: v.id("users"),

    // Role in room
    role: v.union(
      v.literal("admin"),            // room creator
      v.literal("player"),           // normal player
      v.literal("spectator"),        // watching only
    ),

    // In-game state
    isReady: v.boolean(),            // toggled in lobby before game starts
    seatIndex: v.optional(v.number()), // position at the table (0, 1, 2, ...)
    score: v.optional(v.number()),

    joinedAt: v.number(),
  })
    .index("by_room", ["roomId"])
    .index("by_user", ["userId"])
    .index("by_room_and_user", ["roomId", "userId"]),


  // ─── GAMES ───────────────────────────────────────────────────────────────
  // One room can host multiple games (rematches)
  games: defineTable({
    roomId: v.id("rooms"),

    status: v.union(
      v.literal("active"),
      v.literal("finished"),
    ),

    winnerId: v.optional(v.id("users")),  // null if draw or ongoing

    // Snapshot of settings at game start
    gameMode: v.string(),
    timeLimitSeconds: v.optional(v.number()),

    startedAt: v.number(),
    endedAt: v.optional(v.number()),
  })
    .index("by_room", ["roomId"])
    .index("by_status", ["status"]),


  // ─── GAME PLAYERS ────────────────────────────────────────────────────────
  // Tracks each user's state within a specific game
  gamePlayers: defineTable({
    gameId: v.id("games"),
    userId: v.id("users"),

    seatIndex: v.number(),           // order around the table
    finalScore: v.optional(v.number()),
    placement: v.optional(v.number()), // 1st, 2nd, 3rd...
    isEliminated: v.boolean(),

    hand: v.array(v.string()),       // card IDs currently in hand e.g. ["AS", "KH"]
  })
    .index("by_game", ["gameId"])
    .index("by_user", ["userId"])
    .index("by_game_and_user", ["gameId", "userId"]),


  // ─── GAME STATE ──────────────────────────────────────────────────────────
  // The live state of a game (updated in real time)
  gameStates: defineTable({
    gameId: v.id("games"),

    currentTurnUserId: v.id("users"),  // whose turn it is
    turnNumber: v.number(),
    turnStartedAt: v.number(),          // for enforcing time limits

    deck: v.array(v.string()),          // remaining draw pile
    discardPile: v.array(v.string()),   // face-up discard pile
    direction: v.union(
      v.literal("clockwise"),
      v.literal("counter_clockwise"),
    ),

    phase: v.union(
      v.literal("draw"),               // player must draw
      v.literal("play"),               // player must play
      v.literal("end_turn"),           // wrapping up turn
    ),

    lastAction: v.optional(v.string()),  // description of last move
  })
    .index("by_game", ["gameId"]),


  // ─── GAME ACTIONS (move history) ─────────────────────────────────────────
  gameActions: defineTable({
    gameId: v.id("games"),
    userId: v.id("users"),

    actionType: v.union(
      v.literal("play_card"),
      v.literal("draw_card"),
      v.literal("pass"),
      v.literal("special"),           // wild cards, skip, reverse, etc.
    ),

    card: v.optional(v.string()),      // card played e.g. "AS" = Ace of Spades
    metadata: v.optional(v.string()),  // JSON string for extra action data

    timestamp: v.number(),
  })
    .index("by_game", ["gameId"])
    .index("by_game_and_user", ["gameId", "userId"]),

});