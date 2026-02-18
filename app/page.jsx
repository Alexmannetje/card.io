'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../convex/_generated/api';

export default function Home() {
  const router = useRouter();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [quickPrivate, setQuickPrivate] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinName, setJoinName] = useState('');
  const [creatingRoom, setCreatingRoom] = useState(false);
  const createRoom = useMutation(api.rooms.createRoom);

  const handleCreateClick = () => {
    setShowCreateModal(true);
  };

  const handleStartCreate = async () => {
    if (creatingRoom) return;
    setCreatingRoom(true);
    try {
      const result = await createRoom({
        isPrivate: quickPrivate,
        gameMode: 'none',
        maxPlayers: 4,
      });
      setShowCreateModal(false);
      setQuickPrivate(false);
      router.push(`/room?code=${result.code}&name=Host`);
    } finally {
      setCreatingRoom(false);
    }
  };

  const handleJoin = () => {
    const code = joinCode.trim().toUpperCase();
    const name = joinName.trim();
    if (!code || !name) {
      return;
    }
    router.push(`/room?code=${encodeURIComponent(code)}&name=${encodeURIComponent(name)}`);
  };

  return (
    <div
      className="relative min-h-screen text-white bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: "url('/bg/bg-menu-big.png')" }}
    >
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />

      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen">
        <h1 className="text-6xl font-bold mb-4">
          <span className="text-blue-500">Card</span>
          <span className="text-purple-400">.io</span>
        </h1>

        <p className="text-lg text-gray-300 mb-12 max-w-md text-center">
          Create a room or join an existing one by code.
        </p>

        <div className="flex flex-col items-center space-y-8">
          <div className="flex space-x-6">
            <button
              type="button"
              onClick={handleCreateClick}
              className="block transition hover:opacity-90 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-900 rounded-lg"
            >
              <img
                src="/button/button-create-game.png"
                alt="Create Game"
                className="h-auto max-h-28 w-auto max-w-[560px] md:max-h-32 md:max-w-[640px] object-contain"
              />
            </button>
          </div>

          <div className="w-full max-w-md bg-gray-800/80 border border-gray-700 rounded-xl p-5 space-y-4">
            <h2 className="text-lg font-semibold text-white">Join a game</h2>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="block text-sm text-gray-300">Room code</label>
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  placeholder="ABC123"
                  className="w-full px-4 py-2.5 rounded-lg bg-gray-900/70 text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-900"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-sm text-gray-300">Your username</label>
                <input
                  type="text"
                  value={joinName}
                  onChange={(e) => setJoinName(e.target.value)}
                  placeholder="Choose a name"
                  className="w-full px-4 py-2.5 rounded-lg bg-gray-900/70 text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-900"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={handleJoin}
              className="w-full px-4 py-2.5 text-sm font-medium bg-purple-500 rounded-lg shadow-lg hover:bg-purple-600 transition disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={!joinCode.trim() || !joinName.trim()}
            >
              Join Game
            </button>
          </div>
        </div>
      </div>

      {/* Create options modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-sm rounded-xl bg-gray-900 border border-gray-700 shadow-2xl p-4 space-y-2">
            <h2 className="text-xl font-semibold text-white">Create Room</h2>
            <p className="text-xs text-gray-400 pb-4">
              Choose if you want your room code to be hiden.
            </p>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-200">Private room</p>
                <p className="text-xs text-gray-400">
                  Only people with the code can join.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setQuickPrivate((prev) => !prev)}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${
                  quickPrivate ? 'bg-blue-500' : 'bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                    quickPrivate ? 'translate-x-5' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowCreateModal(false);
                  setQuickPrivate(false);
                }}
                className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleStartCreate}
                disabled={creatingRoom}
                className="px-5 py-2 text-sm font-medium bg-blue-500 rounded-lg text-white hover:bg-blue-600 disabled:opacity-60 disabled:cursor-not-allowed transition"
              >
                {creatingRoom ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
