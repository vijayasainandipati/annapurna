import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const token = typeof window !== 'undefined' ? localStorage.getItem('annapurna_token') : null;
    socket = io({
      path: '/socket.io',
      auth: { token },
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
    });

    socket.on('connect', () => {
      console.log('⚡ Connected to Annapurna Realtime Message Bus via Socket.IO');
    });

    socket.on('disconnect', () => {
      console.log('🔌 Disconnected from Annapurna Realtime Message Bus');
    });
  }
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
