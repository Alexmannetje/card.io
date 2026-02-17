import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function getOrCreateSystemUser(ctx) {
  const existing = await ctx.db
    .query("users")
    .withIndex("by_username", (q) => q.eq("username", "system"))
    .first();
  if (existing) return existing._id;

  const now = Date.now();
  return ctx.db.insert("users", {
    clerkId: `system_${now}`,
    email: "system@example.com",
    username: "system",
    avatarUrl: undefined,
    gamesPlayed: 0,
    gamesWon: 0,
    gamesLost: 0,
    createdAt: now,
    lastSeenAt: now,
  });
}

export const createRoom = mutation({
  args: {
    isPrivate: v.boolean(),
    gameMode: v.union(
      v.literal("classic"),
      v.literal("speed"),
      v.literal("tournament"),
      v.literal("custom"),
      v.literal("chaos"),
      v.literal("presidents"),
    ),
    maxPlayers: v.number(),
  },
  handler: async (ctx, args) => {
    const adminId = await getOrCreateSystemUser(ctx);

    // Generate a unique room code
    let code;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const candidate = generateRoomCode();
      const existing = await ctx.db
        .query("rooms")
        .withIndex("by_code", (q) => q.eq("code", candidate))
        .first();
      if (!existing) {
        code = candidate;
        break;
      }
    }

    const now = Date.now();
    const roomId = await ctx.db.insert("rooms", {
      code,
      name: `Room ${code}`,
      adminId,
      gameMode: args.gameMode,
      maxPlayers: args.maxPlayers,
      deckCount: 1,
      timeLimitSeconds: undefined,
      status: "waiting",
      isPrivate: args.isPrivate,
      password: undefined,
      createdAt: now,
      startedAt: undefined,
      endedAt: undefined,
    });

    return { roomId, code };
  },
});

export const joinRoom = mutation({
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

    // Find or create a simple user record based on username
    let user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", args.username))
      .first();

    if (!user) {
      const now = Date.now();
      const userId = await ctx.db.insert("users", {
        clerkId: `local_${now}_${Math.random().toString(36).slice(2, 8)}`,
        email: `${args.username.toLowerCase()}+local@example.com`,
        username: args.username,
        avatarUrl: undefined,
        gamesPlayed: 0,
        gamesWon: 0,
        gamesLost: 0,
        createdAt: now,
        lastSeenAt: now,
      });
      user = await ctx.db.get(userId);
    }

    if (!user) {
      throw new ConvexError("Failed to create user");
    }

    // Check if the user is already a member of the room
    let member = await ctx.db
      .query("roomMembers")
      .withIndex("by_room_and_user", (q) =>
        q.eq("roomId", room._id).eq("userId", user._id),
      )
      .first();

    if (!member) {
      const existingMembers = await ctx.db
        .query("roomMembers")
        .withIndex("by_room", (q) => q.eq("roomId", room._id))
        .collect();

      const isFirst = existingMembers.length === 0;

      const memberId = await ctx.db.insert("roomMembers", {
        roomId: room._id,
        userId: user._id,
        role: isFirst ? "admin" : "player",
        isReady: false,
        seatIndex: existingMembers.length,
        score: undefined,
        joinedAt: Date.now(),
      });

      member = await ctx.db.get(memberId);
    }

    return {
      roomId: room._id,
      userId: user._id,
    };
  },
});

export const getRoomByCode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();

    if (!room) return null;

    const members = await ctx.db
      .query("roomMembers")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .collect();

    const users = await Promise.all(members.map((m) => ctx.db.get(m.userId)));
    const usersById = new Map(users.filter(Boolean).map((u) => [u._id, u]));

    const players = members
      .map((m) => {
        const user = usersById.get(m.userId);
        if (!user) return null;
        return {
          id: m._id,
          username: user.username,
          role: m.role,
          isReady: m.isReady,
          seatIndex: m.seatIndex ?? undefined,
        };
      })
      .filter(Boolean);

    return {
      room,
      players,
    };
  },
});

export const updateRoomSettings = mutation({
  args: {
    code: v.string(),
    username: v.string(),
    isPrivate: v.optional(v.boolean()),
    gameMode: v.optional(
      v.union(
        v.literal("classic"),
        v.literal("speed"),
        v.literal("tournament"),
        v.literal("custom"),
        v.literal("chaos"),
        v.literal("presidents"),
      ),
    ),
    maxPlayers: v.optional(v.number()),
    deckCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();

    if (!room) {
      throw new ConvexError("Room not found");
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
      throw new ConvexError("Only the host can change settings");
    }

    const patch = {};

    if (args.isPrivate !== undefined) {
      patch.isPrivate = args.isPrivate;
    }

    if (args.gameMode !== undefined) {
      patch.gameMode = args.gameMode;
    }

    if (args.maxPlayers !== undefined) {
      const clamped = Math.max(2, Math.min(10, args.maxPlayers));
      patch.maxPlayers = clamped;
    }

    if (args.deckCount !== undefined) {
      const deckCount = Math.max(1, args.deckCount);
      patch.deckCount = deckCount;
    }

    if (Object.keys(patch).length === 0) {
      return;
    }

    await ctx.db.patch(room._id, patch);
  },
});


export const leaveRoom = mutation({
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

    const user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", args.username))
      .first();

    if (!user) {
      return;
    }

    const member = await ctx.db
      .query("roomMembers")
      .withIndex("by_room_and_user", (q) =>
        q.eq("roomId", room._id).eq("userId", user._id),
      )
      .first();

    if (!member) {
      return;
    }

    const wasHost = member.role === "admin";

    await ctx.db.delete(member._id);

    if (wasHost) {
      // Promote the next player (earliest joined) to host, if any remain.
      const remainingMembers = await ctx.db
        .query("roomMembers")
        .withIndex("by_room", (q) => q.eq("roomId", room._id))
        .collect();

      if (remainingMembers.length > 0) {
        const nextHost = remainingMembers.reduce((earliest, current) =>
          current.joinedAt < earliest.joinedAt ? current : earliest,
        remainingMembers[0]);

        await ctx.db.patch(nextHost._id, { role: "admin" });
        await ctx.db.patch(room._id, { adminId: nextHost.userId });
      }
    }
  },
});

