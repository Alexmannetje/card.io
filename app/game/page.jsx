'use client';

import { useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';

const SUIT_SYMBOLS = { S: '♠', H: '♥', D: '♦', C: '♣' };
const SUIT_COLORS = { S: 'text-gray-100', H: 'text-red-400', D: 'text-red-400', C: 'text-gray-100' };

// Sort order: 2 highest, then A, K, Q, J, T, 9…3. Suit: Heart, Spade, Diamond, Club.
const RANK_ORDER = ['2', 'A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3'];
const SUIT_ORDER = ['H', 'S', 'D', 'C'];

function getRank(cardId) {
  return cardId && cardId[0] ? cardId[0] : '';
}

function cardSortIndex(cardId) {
  if (!cardId || cardId.length < 2) return 0;
  const rank = cardId[0];
  const suit = cardId[1];
  const r = RANK_ORDER.indexOf(rank);
  const s = SUIT_ORDER.indexOf(suit);
  return (r < 0 ? 99 : r) * 10 + (s < 0 ? 9 : s);
}

function sortHand(hand) {
  return [...hand].sort((a, b) => cardSortIndex(a) - cardSortIndex(b));
}

/** Group sorted hand by rank, preserving order. Each item: { rank, cards: [{ cardId, index }] } */
function groupHandByRank(sortedHand) {
  const groups = [];
  let currentRank = null;
  let currentCards = [];
  sortedHand.forEach((cardId, index) => {
    const r = getRank(cardId);
    if (r !== currentRank) {
      if (currentRank !== null) {
        groups.push({ rank: currentRank, cards: currentCards });
      }
      currentRank = r;
      currentCards = [{ cardId, index }];
    } else {
      currentCards.push({ cardId, index });
    }
  });
  if (currentRank !== null) {
    groups.push({ rank: currentRank, cards: currentCards });
  }
  return groups;
}

function cardLabel(cardId) {
  if (!cardId || cardId.length < 2) return cardId;
  const rank = cardId[0] === 'T' ? '10' : cardId[0];
  const suit = cardId[1];
  return { rank, suit, symbol: SUIT_SYMBOLS[suit] ?? suit, colorClass: SUIT_COLORS[suit] ?? 'text-gray-300' };
}

function placementLabel(n) {
  if (n < 1) return '';
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function Card({ cardId, selected, onClick, onContextMenu }) {
  const { rank, symbol, colorClass } = cardLabel(cardId);
  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`inline-flex flex-col items-center justify-center w-12 h-16 rounded-lg border-2 shadow-md font-semibold text-sm transition-all ${colorClass} ${
        selected
          ? 'border-gray-400 bg-gray-700 ring-1 ring-gray-400/30 -translate-y-1'
          : 'border-gray-600 bg-gray-800 hover:border-gray-500 hover:-translate-y-0.5'
      }`}
      title={cardId}
    >
      <span className="text-xl">{rank}</span>
      <span className="text-xl leading-none">{symbol}</span>
    </button>
  );
}

function CardBack({ small = false }) {
  return (
    <div
      className={`inline-flex rounded-lg border-2 border-amber-800 bg-gradient-to-br from-amber-900 to-amber-950 shadow-md ${
        small ? 'w-7 h-9' : 'w-12 h-16'
      }`}
      title="Card back"
      style={{
        backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(0,0,0,0.1) 4px, rgba(0,0,0,0.1) 5px)',
      }}
    />
  );
}

/** Turn Convex/backend errors into short, readable messages for the game UI. */
function getFriendlyGameError(err, fallback = 'Something went wrong') {
  // Convex puts our thrown message in err.data; err.message is the long "[CONVEX M(...)] ..." wrapper
  const raw =
    (typeof err?.data === 'string' ? err.data : err?.data?.message) ??
    err?.message ??
    (typeof err === 'string' ? err : '');
  if (!raw) return fallback;
  const msg = String(raw).trim();
  if (msg.startsWith('[CONVEX') || msg.startsWith('Server Error')) return fallback;
  if (msg.match(/^Play at least (\d+) card/)) {
    const n = msg.replace(/\D/g, '') || '1';
    return `Must play ${n} card${n === '1' ? '' : 's'} or more.`;
  }
  const friendly = {
    'Play same or higher rank': 'Must play same or higher rank.',
    'Play same rank only (2 counts as joker)': 'Play cards of the same rank (2s can be jokers).',
    '2 cannot be played alone (joker must go with another rank)': "Can't play 2s alone—use them with another rank.",
    'Not your turn': "It's not your turn.",
    'Select at least one card to play': 'Select at least one card to play.',
    'You are not in this game': "You're not in this game.",
    'Card not in hand': "Card isn't in your hand.",
    'You must lead; you cannot pass': "You must lead; you can't pass.",
    'Complete the card exchange first': 'Complete the card exchange first.',
    'Round has ended; wait for the host to restart': 'Round has ended. Wait for the host to restart.',
    'This game is not Presidents mode': 'This game is not Presidents mode.',
    'Only the host can restart the round': 'Only the host can restart the round.',
    'Round has not ended': "Round hasn't ended yet.",
    'Not in exchange phase': "Not in exchange phase.",
    'You are not giving cards in this exchange': "You're not giving cards in this exchange.",
    'Selected card not in your hand': "Selected card isn't in your hand.",
  };
  if (friendly[msg]) return friendly[msg];
  if (msg.match(/^Select exactly (\d+) card/)) {
    const n = msg.replace(/\D/g, '') || '1';
    return `Select exactly ${n} card${n === '1' ? '' : 's'} to give.`;
  }
  if (msg.includes('Room not found') || msg.includes('Game not found')) return 'Game or room not found.';
  return msg.length > 80 ? `${msg.slice(0, 77)}…` : msg;
}

export default function GamePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const codeParam = searchParams.get('code');
  const usernameParam = searchParams.get('name');
  const [selectedIndices, setSelectedIndices] = useState(() => new Set());
  const [playError, setPlayError] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [submittingExchange, setSubmittingExchange] = useState(false);
  const playCardsMutation = useMutation(api.games.playCards);
  const passMutation = useMutation(api.games.pass);
  const leaveRoomMutation = useMutation(api.rooms.leaveRoom);
  const restartRoundMutation = useMutation(api.games.restartRound);
  const submitExchangeSelectionMutation = useMutation(api.games.submitExchangeSelection);

  // Group as pile: left click = add one from group, right click = remove one from group
  const handleGroupAddOne = useCallback((group, hand) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      const indicesInGroup = group.cards.map((c) => c.index);
      const firstUnselected = group.cards.find((c) => !prev.has(c.index));
      if (!firstUnselected) return next; // group fully selected

      const selectedNonTwoRanks = [...prev]
        .map((i) => getRank(hand[i]))
        .filter((r) => r !== '2');
      const uniqueNonTwoRank = selectedNonTwoRanks.length ? selectedNonTwoRanks[0] : null;
      if (uniqueNonTwoRank !== null && uniqueNonTwoRank !== group.rank) {
        next.clear();
        prev.forEach((i) => {
          if (getRank(hand[i]) === '2') next.add(i);
        });
      }
      next.add(firstUnselected.index);
      return next;
    });
  }, []);

  const handleGroupRemoveOne = useCallback((group) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      const selectedInGroup = group.cards
        .filter((c) => prev.has(c.index))
        .map((c) => c.index)
        .sort((a, b) => b - a);
      if (selectedInGroup.length > 0) next.delete(selectedInGroup[0]);
      return next;
    });
  }, []);

  const gameData = useQuery(
    api.games.getGameByRoomCode,
    codeParam && usernameParam
      ? { code: codeParam.toUpperCase(), username: usernameParam }
      : 'skip',
  );

  const [leaving, setLeaving] = useState(false);
  const handleLeaveRoom = async () => {
    if (!codeParam || !usernameParam || leaving) return;
    setLeaving(true);
    try {
      await leaveRoomMutation({
        code: codeParam.toUpperCase(),
        username: usernameParam,
      });
    } catch {
      // ignore errors on leave
    } finally {
      setLeaving(false);
    }
    router.push('/');
  };

  if (!codeParam || !usernameParam) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center gap-4">
        <p className="text-gray-400">Missing room code or username.</p>
        <button
          type="button"
          onClick={() => router.push('/')}
          className="px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600"
        >
          Go home
        </button>
      </div>
    );
  }

  if (gameData === undefined) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center">
        <p className="text-gray-400">Loading game…</p>
      </div>
    );
  }

  if (!gameData) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-gray-400 text-center">No active game for this room. Start a game from the room lobby.</p>
        <button
          type="button"
          onClick={handleLeaveRoom}
          disabled={leaving}
          className="px-4 py-2 bg-blue-600 rounded-lg hover:bg-blue-500 disabled:opacity-50"
        >
          {leaving ? '…' : 'Leave room'}
        </button>
      </div>
    );
  }

  const { game, players, deckCount, totalCards, gameState, isHost } = gameData;
  const me = players.find((p) => p.isCurrentUser);
  const myHandSorted = sortHand(me?.hand ?? []);
  const others = players.filter((p) => !p.isCurrentUser);
  const handGroups = groupHandByRank(myHandSorted);
  const selectedSet = selectedIndices;

  const currentTurnUserId = gameState?.currentTurnUserId;
  const currentTurnPlayer = players.find((p) => p.userId === currentTurnUserId);
  const isMyTurn = !!me && currentTurnUserId === me.userId;

  const selectedCardIds = [...selectedSet].map((i) => myHandSorted[i]);
  const selectedRanks = selectedCardIds.map((id) => getRank(id));
  const allSelectedAreTwos = selectedRanks.length > 0 && selectedRanks.every((r) => r === '2');
  const canPlaySelection = selectedSet.size > 0 && !allSelectedAreTwos;

  const handlePlay = async () => {
    if (!canPlaySelection || !codeParam || !usernameParam || playing) return;
    setPlayError(null);
    setPlaying(true);
    try {
      await playCardsMutation({
        code: codeParam.toUpperCase(),
        username: usernameParam,
        cardIds: selectedCardIds,
      });
      setSelectedIndices(new Set());
    } catch (err) {
      setPlayError(getFriendlyGameError(err, 'Play failed'));
    } finally {
      setPlaying(false);
    }
  };

  const handlePass = async () => {
    if (!isMyTurn || !codeParam || !usernameParam || playing) return;
    setPlayError(null);
    setPlaying(true);
    try {
      await passMutation({
        code: codeParam.toUpperCase(),
        username: usernameParam,
      });
    } catch (err) {
      setPlayError(getFriendlyGameError(err, 'Pass failed'));
    } finally {
      setPlaying(false);
    }
  };

  const lastPlayedCount = gameState?.lastPlayedCount ?? 0;
  const lastPlayedRank = gameState?.lastPlayedRank;
  const lastPlayedBy = gameState?.lastPlayedBy;
  const lastPlayedPlayer = lastPlayedBy ? players.find((p) => p.userId === lastPlayedBy) : null;
  const discardPile = gameState?.discardPile ?? [];
  const lastPlayedCards = lastPlayedCount > 0 ? discardPile.slice(-lastPlayedCount) : [];
  const passedUserIdsSet = new Set(gameState?.passedUserIds ?? []);

  const phase = gameState?.phase ?? 'play';
  const roundEnded = phase === 'round_ended';
  const exchangePhase = phase === 'exchange';
  const exchangePairs = gameState?.exchangePairs ?? [];
  const exchangeSelections = gameState?.exchangeSelections ?? [];
  const myExchangePair = me ? exchangePairs.find((p) => p.fromUserId === me.userId) : null;
  const myExchangeRecipient = myExchangePair ? players.find((p) => p.userId === myExchangePair.toUserId) : null;
  const iHaveSubmittedExchange = myExchangePair ? exchangeSelections.some((s) => s.fromUserId === me?.userId) : false;
  const roundLoserId = gameState?.roundLoserId;
  const finishedOrder = gameState?.finishedOrder ?? [];
  const firstFinisherId = finishedOrder[0];
  const roundLoserPlayer = roundLoserId ? players.find((p) => p.userId === roundLoserId) : null;
  const firstFinisherPlayer = firstFinisherId ? players.find((p) => p.userId === firstFinisherId) : null;

  const handleRestartRound = async () => {
    if (!codeParam || !usernameParam || restarting || !isHost) return;
    setRestarting(true);
    try {
      await restartRoundMutation({
        code: codeParam.toUpperCase(),
        username: usernameParam,
      });
      setSelectedIndices(new Set());
    } catch (err) {
      setPlayError(getFriendlyGameError(err, 'Restart failed'));
    } finally {
      setRestarting(false);
    }
  };

  const handleSubmitExchange = async () => {
    if (!myExchangePair || !codeParam || !usernameParam || submittingExchange) return;
    const cardIds = [...selectedIndices].map((i) => myHandSorted[i]);
    if (cardIds.length !== myExchangePair.count) return;
    setPlayError(null);
    setSubmittingExchange(true);
    try {
      await submitExchangeSelectionMutation({
        code: codeParam.toUpperCase(),
        username: usernameParam,
        cardIds,
      });
      setSelectedIndices(new Set());
    } catch (err) {
      setPlayError(getFriendlyGameError(err, 'Submit failed'));
    } finally {
      setSubmittingExchange(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-gray-900 text-white">
      <div className="absolute inset-0 bg-gradient-to-b from-gray-800 to-gray-900 opacity-90" />
      {/* Round ended modal */}
      {roundEnded && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
          <div className="bg-gray-800 border border-gray-600 rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h2 className="text-xl font-bold text-center">Game finished</h2>
            <p className="text-gray-300 text-center">
            {firstFinisherPlayer && (
              <p className="text-gray-300 text-md pb-2 text-center">
                <strong>{firstFinisherPlayer.username}</strong> is first and will be The President.
              </p>
            )}
              {roundLoserPlayer && (
                <p className="text-gray-400 text-sm text-center">
                <strong>{roundLoserPlayer.username}</strong> lost and will be The Sluth.
              </p>
              )}
            </p>
            {isHost ? (
              <button
                type="button"
                onClick={handleRestartRound}
                disabled={restarting}
                className="w-full py-3 px-4 bg-green-600 hover:bg-green-500 disabled:opacity-50 rounded-lg font-semibold text-sm transition"
              >
                {restarting ? 'Restarting…' : 'Restart game'}
              </button>
            ) : (
              <p className="text-center text-sm text-gray-500">Waiting for the host to restart the game.</p>
            )}
          </div>
        </div>
      )}
      <div className="relative z-10 flex flex-col min-h-screen">
        <header className="px-6 pt-6 pb-4 md:px-10 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl md:text-3xl font-bold">
            <span className="text-blue-500">Game</span> — {game.gameMode}
          </h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400">
              {deckCount} deck{deckCount !== 1 ? 's' : ''} · {totalCards} cards
            </span>
            <button
              type="button"
              onClick={handleLeaveRoom}
              disabled={leaving}
              className="px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600 disabled:opacity-50 text-sm font-medium"
            >
              {leaving ? '…' : 'Leave room'}
            </button>
          </div>
        </header>

        <main className="flex-1 px-6 pb-24 md:px-10 flex gap-6">
          {/* Left: other players — compact */}
          {others.length > 0 && (
            <aside className="shrink-0 w-36 md:w-40 flex flex-col gap-4 pt-1">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Players</h2>
              {others.map((p) => {
                const showCards = Math.min(5, p.handCount);
                const isOut = p.handCount === 0;
                const placeIndex = finishedOrder.indexOf(p.userId);
                const placement = placeIndex >= 0 ? placementLabel(placeIndex + 1) : null;
                return (
                  <div key={p.id} className="flex flex-col gap-1">
                    <p className="text-sm font-medium text-gray-300 truncate" title={p.username}>
                      {p.username}
                      {isOut && placement && (
                        <span className="ml-1 text-gray-400 font-normal">({placement})</span>
                      )}
                      {!isOut && passedUserIdsSet.has(p.userId) && (
                        <span className="ml-1 text-amber-400 font-normal">(passed)</span>
                      )}
                    </p>
                    <p className="text-sm text-gray-400">{p.handCount} cards</p>
                    <div className="flex items-end">
                      {Array.from({ length: showCards }, (_, i) => (
                        <div
                          key={i}
                          className="relative"
                          style={{
                            marginLeft: 3,
                            zIndex: 5 + i,
                          }}
                        >
                          <CardBack small />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </aside>
          )}

          <div className="flex-1 max-w-4xl space-y-8 min-w-0">
            {/* Exchange phase: select cards to give */}
            {exchangePhase && (
              <section className="rounded-xl bg-amber-900/30 border border-amber-700 p-4">
                <h2 className="text-lg font-semibold text-amber-200 mb-2">Card exchange</h2>
                {myExchangePair ? (
                  iHaveSubmittedExchange ? (
                    <p className="text-gray-300">Waiting for others to select their cards…</p>
                  ) : (
                    <>
                      <p className="text-sm text-gray-300 mb-2">
                        Select <strong>{myExchangePair.count}</strong> card{myExchangePair.count !== 1 ? 's' : ''} to give to <strong>{myExchangeRecipient?.username ?? '?'}</strong>.
                      </p>
                      <button
                        type="button"
                        onClick={handleSubmitExchange}
                        disabled={selectedSet.size !== myExchangePair.count || submittingExchange}
                        className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm transition"
                      >
                        {submittingExchange ? '…' : `Give ${myExchangePair.count} card${myExchangePair.count !== 1 ? 's' : ''}`}
                      </button>
                    </>
                  )
                ) : (
                  <p className="text-gray-400">Waiting for others to select cards to give.</p>
                )}
                {playError && <p className="mt-2 text-sm text-red-400">{playError}</p>}
              </section>
            )}

            {/* Turn and last play (hidden during exchange) */}
            {!exchangePhase && (
            <section className="rounded-xl bg-gray-800/80 border border-gray-700 p-4">
              <p className="text-sm text-gray-400 mb-2">
                {lastPlayedCount === 0
                  ? 'Lead — play any card(s) of the same rank (2 = joker, cannot play 2s alone).'
                  : lastPlayedPlayer
                    ? `Last play: ${lastPlayedPlayer.username} played ${lastPlayedCount} card(s) of rank ${lastPlayedRank === 'T' ? '10' : lastPlayedRank}. Play at least ${lastPlayedCount} card(s), same or higher rank.`
                    : 'Next: play at least same count, same or higher rank, or pass.'}
              </p>
              <p className={`font-medium ${isMyTurn ? 'text-green-400' : 'text-gray-300'}`}>
                {isMyTurn ? "Your turn" : currentTurnPlayer ? `${currentTurnPlayer.username}'s turn` : '—'}
              </p>
              {isMyTurn && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handlePlay}
                    disabled={!canPlaySelection || playing}
                    className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm transition"
                  >
                    {playing ? '…' : 'Play'}
                  </button>
                  {lastPlayedCount > 0 && (
                    <button
                      type="button"
                      onClick={handlePass}
                      disabled={playing}
                      className="px-4 py-2 rounded-lg bg-gray-600 hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm transition"
                    >
                      {playing ? '…' : 'Pass'}
                    </button>
                  )}
                </div>
              )}
              {playError && <p className="mt-2 text-sm text-red-400">{playError}</p>}
            </section>
            )}

            {/* Last played pile — center (hidden during exchange) */}
            {!exchangePhase && (
            <section className="flex flex-col items-center justify-center py-6">
              <p className="text-sm text-gray-500 mb-3">Last play</p>
              <div className="flex items-end justify-center min-h-[5rem]">
                {lastPlayedCards.length === 0 ? (
                  <div className="w-12 h-16 rounded-lg border-2 border-dashed border-gray-600 bg-gray-800/50 flex items-center justify-center text-gray-500 text-xs">
                    —
                  </div>
                ) : (
                  lastPlayedCards.map((cardId, i) => (
                    <div
                      key={`${cardId}-${i}`}
                      className="relative"
                      style={{
                        marginLeft: i === 0 ? 0 : -20,
                        zIndex: 10 + i,
                      }}
                    >
                      <div className="pointer-events-none">
                        <Card cardId={cardId} selected={false} onClick={() => {}} />
                      </div>
                    </div>
                  ))
                )}
              </div>
              {lastPlayedPlayer && lastPlayedCards.length > 0 && (
                <p className="mt-2 text-xs text-gray-500">{lastPlayedPlayer.username}</p>
              )}
            </section>
            )}

            {/* Your hand — grouped by rank with overlap; select same rank or 2s as joker / or for exchange */}
            <section>
              <h2 className="text-lg font-semibold text-gray-300 mb-3">
                {exchangePhase && myExchangePair
                  ? `Select ${myExchangePair.count} card${myExchangePair.count !== 1 ? 's' : ''} to give — your hand (${myHandSorted.length} cards)`
                  : `Your hand (${myHandSorted.length} cards)`}
              </h2>
              {myHandSorted.length === 0 ? (
                <p className="text-gray-500">No cards.</p>
              ) : (
                <div className="flex flex-wrap items-end gap-6">
                  {handGroups.map((group) => (
                    <div
                      key={group.rank}
                      className="flex items-end shrink-0"
                    >
                      {group.cards.map(({ cardId, index }, i) => (
                        <div
                          key={`${cardId}-${index}`}
                          className="relative"
                          style={{
                            marginLeft: i === 0 ? 0 : -20,
                            zIndex: selectedSet.has(index) ? 20 : 10 + i,
                          }}
                        >
                          <Card
                            cardId={cardId}
                            selected={selectedSet.has(index)}
                            onClick={() => {
                              if (exchangePhase && myExchangePair && selectedSet.size >= myExchangePair.count) return;
                              handleGroupAddOne(group, myHandSorted);
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              handleGroupRemoveOne(group);
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
              {selectedSet.size > 0 && (
                <p className="mt-3 text-sm text-gray-400">
                  {selectedSet.size} card{selectedSet.size !== 1 ? 's' : ''} selected {exchangePhase ? 'to give' : 'to play'}
                </p>
              )}
            </section>
          </div>
        </main>
      </div>
      <div className="pointer-events-none absolute top-10 left-10 w-40 h-40 bg-blue-500 rounded-full blur-3xl opacity-30" />
      <div className="pointer-events-none absolute bottom-20 right-20 w-60 h-60 bg-purple-500 rounded-full blur-3xl opacity-30" />
    </div>
  );
}
