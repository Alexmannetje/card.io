'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';

export default function RoomPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const codeParam = searchParams.get('code');
  const usernameParam = searchParams.get('name');

  const [joinError, setJoinError] = useState(null);
  const hasJoinedRef = useRef(false);

  const roomData = useQuery(
    api.rooms.getRoomByCode,
    codeParam ? { code: codeParam.toUpperCase() } : 'skip',
  );

  const joinRoom = useMutation(api.rooms.joinRoom);
  const updateSettings = useMutation(api.rooms.updateRoomSettings);
  const leaveRoom = useMutation(api.rooms.leaveRoom);

  useEffect(() => {
    if (!codeParam || !usernameParam || hasJoinedRef.current) return;

    (async () => {
      try {
        await joinRoom({
          code: codeParam.toUpperCase(),
          username: usernameParam,
        });
        hasJoinedRef.current = true;
      } catch (error) {
        const message =
          (error && typeof error === 'object' && 'message' in error && error.message) ||
          'Failed to join room.';
        setJoinError(message);
      }
    })();
  }, [codeParam, usernameParam, joinRoom]);

  const handleLeaveRoom = async () => {
    if (roomCode && usernameParam) {
      try {
        await leaveRoom({ code: roomCode, username: usernameParam });
      } catch {
        // ignore errors on leave
      }
    }
    router.push('/');
  };

  const roomCode = roomData?.room?.code ?? codeParam?.toUpperCase() ?? '-----';
  const roomName = roomData?.room?.name ?? `Room ${roomCode}`;
  const players = roomData?.players ?? [];

  const isPrivate = roomData?.room?.isPrivate ?? false;
  const gameMode = roomData?.room?.gameMode ?? 'classic';
  const maxPlayers = roomData?.room?.maxPlayers ?? 4;
  const deckCount = roomData?.room?.deckCount ?? 1;

  const missingCode = !codeParam;
  const missingName = !usernameParam;

  const visibleCode = isPrivate ? '******' : roomCode;
  const maxSlots = Math.max(2, Math.min(10, maxPlayers));

  const isHost =
    !!usernameParam &&
    players.some((player) => player.role === 'admin' && player.username === usernameParam);

  const canEditSettings = !!usernameParam && isHost;

  const handleTogglePrivate = () => {
    if (!roomCode || roomCode === '-----' || !usernameParam || !canEditSettings) return;
    updateSettings({ code: roomCode, username: usernameParam, isPrivate: !isPrivate });
  };

  const handleGameModeChange = (event) => {
    if (!roomCode || roomCode === '-----' || !usernameParam || !canEditSettings) return;
    const value = event.target.value;
    updateSettings({ code: roomCode, username: usernameParam, gameMode: value });
  };

  const handleMaxPlayersChange = (event) => {
    if (!roomCode || roomCode === '-----' || !usernameParam || !canEditSettings) return;
    const value = Number(event.target.value) || 2;
    const clamped = Math.max(2, Math.min(10, value));
    updateSettings({ code: roomCode, username: usernameParam, maxPlayers: clamped });
  };

  const handleDeckCountChange = (event) => {
    if (!roomCode || roomCode === '-----' || !usernameParam || !canEditSettings) return;
    const value = Number(event.target.value) || 1;
    const clamped = Math.max(1, value);
    updateSettings({ code: roomCode, username: usernameParam, deckCount: clamped });
  };

  return (
    <div className="relative min-h-screen bg-gray-900 text-white">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-gray-800 to-gray-900 opacity-90"></div>

      {/* Content Wrapper */}
      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Header */}
        <header className="px-6 pt-10 pb-6 md:px-10">
          <h1 className="text-4xl md:text-5xl font-bold">
            <span className="text-blue-500">Your</span> Room
          </h1>
        </header>

        {/* Content */}
        <main className="flex-1 px-6 pb-24 md:px-10">
          <div className="mx-auto max-w-6xl grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.2fr)]">
            {/* Left: Code + Settings */}
            <section className="space-y-6">
              {/* Room Code */}
              <div className="bg-gray-800/80 border border-gray-700 rounded-xl px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">
                    Room code
                  </p>
                  <p className="text-2xl md:text-3xl font-mono font-semibold tracking-[0.4em]">
                    {visibleCode}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (navigator?.clipboard?.writeText && roomCode && roomCode !== '-----') {
                      navigator.clipboard.writeText(roomCode);
                    }
                  }}
                  className="hidden sm:inline-flex items-center rounded-lg border border-gray-600 px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-gray-700/80 transition"
                >
                  Copy
                </button>
              </div>

              {/* Settings */}
              <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-6 space-y-5">
                {/* Private toggle */}
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-200">Private room</p>
                    <p className="text-xs text-gray-400">
                      Only people with the code can join.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={canEditSettings ? handleTogglePrivate : undefined}
                    className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${
                      isPrivate ? 'bg-blue-500' : 'bg-gray-600'
                    } ${!canEditSettings ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                        isPrivate ? 'translate-x-5' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {/* Game mode */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-200">Game mode</label>
                  <select
                    value={gameMode}
                    onChange={canEditSettings ? handleGameModeChange : undefined}
                    disabled={!canEditSettings}
                    className="w-full px-4 py-3 bg-gray-900/70 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="none">None</option>
                    <option value="presidents">Presidents</option>
                  </select>
                </div>

                {/* Max players */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-200">
                    Maximum players
                  </label>
                  <input
                    type="number"
                    min="2"
                    max="8"
                    className="w-full px-4 py-3 bg-gray-900/70 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
                    value={maxPlayers}
                    onChange={handleMaxPlayersChange}
                    disabled={!canEditSettings}
                  />
                </div>

                {/* Deck amount for Presidents */}
                {gameMode === 'presidents' && (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-200">
                      Deck amount
                    </label>
                    <input
                      type="number"
                      min="1"
                      className="w-full px-4 py-3 bg-gray-900/70 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
                      value={deckCount}
                      onChange={handleDeckCountChange}
                      disabled={!canEditSettings}
                    />
                  </div>
                )}
              </div>
            </section>

            {/* Right: Lobby */}
            <section className="bg-gray-800/80 border border-gray-700 rounded-xl p-6 flex flex-col">
              <div className="flex items-baseline justify-between mb-4">
                <div>
                  <h2 className="text-xl font-semibold">Lobby</h2>
                </div>
                <span className="text-sm text-gray-300">
                  {players.length} / {maxSlots} joined
                </span>
              </div>

              {/* Error / missing params */}
              {(missingCode || missingName || joinError) && (
                <div className="mb-4 text-sm text-red-400">
                  {missingCode && <p>No room code provided. Go back and enter a code.</p>}
                  {missingName && !missingCode && <p>No username provided. Go back and enter your name.</p>}
                  {joinError && !missingCode && !missingName && <p>{joinError}</p>}
                </div>
              )}

              <div className="space-y-2 flex-1 overflow-y-auto">
                {roomData === undefined && !missingCode ? (
                  <p className="text-sm text-gray-400">Loading room...</p>
                ) : !roomData ? (
                  <p className="text-sm text-gray-400">Room not found.</p>
                ) : players.length === 0 ? (
                  <p className="text-sm text-gray-400">
                    No players yet. Waiting for people to join.
                  </p>
                ) : (
                  players.map((player, index) => (
                    <div
                      key={player.id}
                      className="flex items-center justify-between rounded-lg bg-gray-900/70 px-4 py-3 border border-gray-700/60"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-xs font-semibold">
                          {player.role === 'admin' ? 'YOU' : index + 1}
                        </div>
                        <div>
                          <p className="text-sm font-medium">
                            {player.username}
                          </p>
                          <p className="text-xs text-gray-400">
                            {player.role === 'admin' ? 'Host' : ' '}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Leave Room Button */}
              <div className="w-full text-right mt-6">
                <button
                  onClick={handleLeaveRoom}
                  className="inline-flex px-6 py-2.5 bg-red-500 rounded-lg shadow-md hover:bg-red-600 transition font-semibold text-sm"
                >
                  Leave Room
                </button>
              </div>
            </section>
          </div>
        </main>
      </div>

      {/* Background Decorations */}
      <div className="absolute top-10 left-10 w-40 h-40 bg-blue-500 rounded-full blur-3xl opacity-30"></div>
      <div className="absolute bottom-20 right-20 w-60 h-60 bg-purple-500 rounded-full blur-3xl opacity-30"></div>
    </div>
  );
}
