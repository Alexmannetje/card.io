'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export default function CreatePage() {
  const [maxPlayers, setMaxPlayers] = useState(4);
  const searchParams = useSearchParams();
  const codeParam = searchParams?.get('code');
  const initialPrivate =
    searchParams?.get('private') === '1' || searchParams?.get('private') === 'true';
  const [isPrivate, setIsPrivate] = useState(initialPrivate);
  const [gameMode, setGameMode] = useState('classic');
  const [roomCode, setRoomCode] = useState('------');
  const router = useRouter();

  useEffect(() => {
    if (codeParam) {
      setRoomCode(codeParam.toUpperCase());
    } else {
      setRoomCode(generateRoomCode());
    }
  }, [codeParam]);

  const handleGoToRoom = () => {
    if (!roomCode || roomCode === '------') return;
    router.push(`/room?code=${encodeURIComponent(roomCode)}&name=Host`);
  };

  return (
    <div className="relative min-h-screen bg-gray-900 text-white">
      {/* Background Overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-gray-900 via-gray-900 to-black opacity-90"></div>

      {/* Main Content */}
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
                    {isPrivate ? '******' : roomCode}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (navigator?.clipboard?.writeText) {
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
                    onClick={() => setIsPrivate((prev) => !prev)}
                    className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${
                      isPrivate ? 'bg-blue-500' : 'bg-gray-600'
                    }`}
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
                    onChange={(e) => setGameMode(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-900/70 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900"
                  >
                    <option value="classic">Classic</option>
                    <option value="speed">Speed</option>
                    <option value="presidents">Presidents</option>
                    <option value="chaos">Chaos</option>
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
                    max="10"
                    className="w-full px-4 py-3 bg-gray-900/70 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900"
                    value={maxPlayers}
                    onChange={(e) => setMaxPlayers(Number(e.target.value) || 2)}
                  />
                </div>

              </div>

              {/* Go to room button */}
              <button
                onClick={handleGoToRoom}
                className="w-full px-6 py-3 bg-blue-500 text-base md:text-lg font-medium rounded-lg shadow-lg hover:bg-blue-600 transition focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-gray-900"
              >
                Go to Room
              </button>
            </section>

              {/* Right: Lobby preview */}
              <section className="bg-gray-800/80 border border-gray-700 rounded-xl p-6 flex flex-col">
                <div className="flex items-baseline justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-semibold">Lobby</h2>
                    <p className="text-xs text-gray-400">
                      Players waiting to start.
                    </p>
                  </div>
                  <span className="text-sm text-gray-300">
                    1 / {Math.max(2, Math.min(10, maxPlayers))} joined
                  </span>
                </div>

                <div className="space-y-2 flex-1 overflow-y-auto">
                  {Array.from({ length: Math.max(2, Math.min(10, maxPlayers)) }).map((_, index) => {
                    const isYou = index === 0;
                    return (
                      <div
                        key={index}
                        className="flex items-center justify-between rounded-lg bg-gray-900/70 px-4 py-3 border border-gray-700/60"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-xs font-semibold">
                            {isYou ? 'YOU' : index + 1}
                          </div>
                          <div>
                            <p className="text-sm font-medium">
                              {isYou ? 'You' : `Player ${index + 1}`}
                            </p>
                            <p className="text-xs text-gray-400">
                              {isYou ? 'Host' : 'Waiting for player...'}
                            </p>
                          </div>
                        </div>
                        {!isYou && (
                          <button
                            type="button"
                            className="text-xs font-medium text-red-400 hover:text-red-300"
                          >
                            Kick
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
          </div>
        </main>
      </div>

      {/* Decorative Background */}
      <div className="pointer-events-none absolute top-10 left-10 w-40 h-40 bg-blue-500 rounded-full blur-3xl opacity-30"></div>
      <div className="pointer-events-none absolute bottom-20 right-20 w-60 h-60 bg-purple-500 rounded-full blur-3xl opacity-30"></div>
    </div>
  );
}
