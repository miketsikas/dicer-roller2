export interface ShareContext {
  roomCode: string;
  player: string;
  replayId?: string;
}

export function buildShareUrl(context: ShareContext, currentHref: string): string {
  const url = new URL(currentHref);
  url.searchParams.set('room', context.roomCode);
  url.searchParams.set('player', context.player);

  if (context.replayId) {
    url.searchParams.set('replay', context.replayId);
  } else {
    url.searchParams.delete('replay');
  }

  return url.toString();
}

export function parseShareParams(search: string): Partial<ShareContext> {
  const params = new URLSearchParams(search);
  const roomCode = params.get('room')?.trim() ?? '';
  const player = params.get('player')?.trim() ?? '';
  const replayId = params.get('replay')?.trim() ?? undefined;

  const next: Partial<ShareContext> = {};
  if (roomCode) {
    next.roomCode = roomCode;
  }
  if (player) {
    next.player = player;
  }
  if (replayId) {
    next.replayId = replayId;
  }
  return next;
}
