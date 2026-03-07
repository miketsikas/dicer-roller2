import type { RealtimeChannel, SupabaseClient, User } from '@supabase/supabase-js';
import { buildSpamKey } from '../lib/dice';
import type { DicePoolResult, RollEntry } from '../types';
import { getSupabaseClient } from './supabaseClient';

interface RoomRollRow {
  id: string;
  room_code: string;
  room_name: string;
  roller_id: string;
  roller_alias: string;
  secret: boolean;
  source: RollEntry['source'];
  formula: string | null;
  modifier: number;
  total: number;
  dice_pools: DicePoolResult[];
  note: string | null;
  created_at: string;
}

export interface SubmitRoomRollInput {
  roomCode: string;
  roomName: string;
  playerAlias: string;
  secret: boolean;
  source: RollEntry['source'];
  formula: string | null;
  modifier: number;
  total: number;
  dicePools: DicePoolResult[];
  note?: string;
}

export interface RoomPresenceMember {
  userId: string;
  alias: string;
  onlineAt: string;
}

export interface RoomPresenceEvent {
  type: 'join' | 'leave';
  userId: string;
  alias: string;
  at: number;
}

export interface RoomSubscriptionHandlers {
  onRoll: (entry: RollEntry) => void;
  onPresenceSync: (members: RoomPresenceMember[]) => void;
  onPresenceEvent: (event: RoomPresenceEvent) => void;
}

function requireClient(): SupabaseClient {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }
  return client;
}

function countsLabelFromPools(pools: DicePoolResult[]): string {
  return pools.map((pool) => `${pool.values.length}d${pool.sides}`).join('+');
}

export function mapRoomRollRow(row: RoomRollRow): RollEntry {
  return {
    id: row.id,
    timestamp: Date.parse(row.created_at),
    playerAlias: row.roller_alias,
    roomName: row.room_name,
    roomCode: row.room_code,
    secret: row.secret,
    source: row.source,
    formula: row.formula,
    modifier: row.modifier,
    total: row.total,
    dicePools: row.dice_pools,
    spamKey: buildSpamKey({
      playerAlias: row.roller_alias,
      roomName: row.room_name,
      roomCode: row.room_code,
      secret: row.secret,
      formula: row.formula,
      countsLabel: countsLabelFromPools(row.dice_pools)
    }),
    note: row.note ?? undefined
  };
}

export async function ensureAnonymousUser(): Promise<User> {
  const client = requireClient();
  const {
    data: { user: existingUser }
  } = await client.auth.getUser();

  if (existingUser) {
    return existingUser;
  }

  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.user) {
    throw new Error(error?.message ?? 'Anonymous auth failed.');
  }

  return data.user;
}

export async function upsertRoomMembership(roomCode: string, alias: string): Promise<void> {
  const client = requireClient();
  await ensureAnonymousUser();

  const { error } = await client.rpc('join_room', {
    target_room_code: roomCode,
    target_alias: alias
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function removeRoomMembership(roomCode: string): Promise<void> {
  const client = requireClient();
  await ensureAnonymousUser();
  const { error } = await client.rpc('leave_room', {
    target_room_code: roomCode
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function fetchRoomRollPage(args: {
  roomCode: string;
  beforeCreatedAt?: string | null;
  limit?: number;
}): Promise<RollEntry[]> {
  const client = requireClient();
  const limit = args.limit ?? 100;

  let query = client
    .from('room_rolls')
    .select('*')
    .eq('room_code', args.roomCode)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);

  if (args.beforeCreatedAt) {
    query = query.lt('created_at', args.beforeCreatedAt);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return ((data as RoomRollRow[] | null) ?? []).map(mapRoomRollRow);
}

export async function insertRoomRoll(input: SubmitRoomRollInput): Promise<RollEntry> {
  const client = requireClient();
  const user = await ensureAnonymousUser();

  const { data, error } = await client
    .from('room_rolls')
    .insert({
      room_code: input.roomCode,
      room_name: input.roomName,
      roller_id: user.id,
      roller_alias: input.playerAlias,
      secret: input.secret,
      source: input.source,
      formula: input.formula,
      modifier: input.modifier,
      total: input.total,
      dice_pools: input.dicePools,
      note: input.note ?? null
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to insert room roll.');
  }

  return mapRoomRollRow(data as RoomRollRow);
}

function extractPresenceMembers(rawState: Record<string, unknown>): RoomPresenceMember[] {
  const members: RoomPresenceMember[] = [];

  for (const [key, value] of Object.entries(rawState)) {
    if (!Array.isArray(value)) {
      continue;
    }

    for (const meta of value) {
      if (!meta || typeof meta !== 'object') {
        continue;
      }

      const maybeAlias = typeof (meta as { alias?: unknown }).alias === 'string' ? (meta as { alias: string }).alias : 'Guest';
      const maybeOnlineAt =
        typeof (meta as { online_at?: unknown }).online_at === 'string'
          ? (meta as { online_at: string }).online_at
          : new Date().toISOString();
      const maybeUserId =
        typeof (meta as { user_id?: unknown }).user_id === 'string' ? (meta as { user_id: string }).user_id : key;

      members.push({
        userId: maybeUserId,
        alias: maybeAlias,
        onlineAt: maybeOnlineAt
      });
    }
  }

  const deduped = new Map<string, RoomPresenceMember>();
  for (const member of members) {
    deduped.set(member.userId, member);
  }

  return [...deduped.values()].sort((a, b) => a.alias.localeCompare(b.alias));
}

function firstPresenceMeta(payload: unknown): { alias: string; userId: string } {
  const fallback = { alias: 'Guest', userId: 'unknown' };
  if (!payload || typeof payload !== 'object') {
    return fallback;
  }

  const event = payload as { key?: unknown; newPresences?: unknown[]; leftPresences?: unknown[] };
  const list = Array.isArray(event.newPresences)
    ? event.newPresences
    : Array.isArray(event.leftPresences)
      ? event.leftPresences
      : [];
  const first = list[0];

  if (!first || typeof first !== 'object') {
    return {
      alias: fallback.alias,
      userId: typeof event.key === 'string' ? event.key : fallback.userId
    };
  }

  const alias = typeof (first as { alias?: unknown }).alias === 'string' ? (first as { alias: string }).alias : fallback.alias;
  const userId =
    typeof (first as { user_id?: unknown }).user_id === 'string'
      ? (first as { user_id: string }).user_id
      : typeof event.key === 'string'
        ? event.key
        : fallback.userId;

  return { alias, userId };
}

async function waitForSubscription(channel: RealtimeChannel): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        resolve();
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        reject(new Error(`Realtime subscription failed: ${status}`));
      }
    });
  });
}

export async function subscribeRoom(args: {
  roomCode: string;
  userId: string;
  alias: string;
  handlers: RoomSubscriptionHandlers;
}): Promise<RealtimeChannel> {
  const client = requireClient();
  const {
    data: { session }
  } = await client.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Missing authenticated session for realtime subscription.');
  }

  await client.realtime.setAuth(session.access_token);

  const channel = client.channel(`room:${args.roomCode}`, {
    config: {
      presence: {
        key: args.userId
      }
    }
  });

  channel.on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'room_rolls',
      filter: `room_code=eq.${args.roomCode}`
    },
    (payload) => {
      args.handlers.onRoll(mapRoomRollRow(payload.new as RoomRollRow));
    }
  );

  channel.on('presence', { event: 'sync' }, () => {
    args.handlers.onPresenceSync(extractPresenceMembers(channel.presenceState() as Record<string, unknown>));
  });

  channel.on('presence', { event: 'join' }, (payload) => {
    const meta = firstPresenceMeta(payload);
    args.handlers.onPresenceEvent({
      type: 'join',
      alias: meta.alias,
      userId: meta.userId,
      at: Date.now()
    });
  });

  channel.on('presence', { event: 'leave' }, (payload) => {
    const meta = firstPresenceMeta(payload);
    args.handlers.onPresenceEvent({
      type: 'leave',
      alias: meta.alias,
      userId: meta.userId,
      at: Date.now()
    });
  });

  await waitForSubscription(channel);
  await channel.track({
    alias: args.alias,
    user_id: args.userId,
    online_at: new Date().toISOString()
  });

  return channel;
}

export async function unsubscribeRoom(channel: RealtimeChannel): Promise<void> {
  const client = requireClient();
  try {
    await channel.untrack();
  } catch {
    // Ignore untrack failures.
  }
  await client.removeChannel(channel);
}
