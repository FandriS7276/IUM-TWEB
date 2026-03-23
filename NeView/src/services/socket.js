import { io } from 'socket.io-client';

// Falls back to localhost:4000 when running outside Docker (plain `npm run dev`).
// VITE_SOCKET_URL is injected by docker-compose for the containerised dev environment.
// Note: Socket.io connects to the server root — no /api prefix needed here.
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000';

// Singleton socket instance (only one connection)
let socket = null;

export const getSocket = () => {
    if (!socket) {
        socket = io(SOCKET_URL, {
            autoConnect: false, // connect manually when needed
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
        });

        socket.on('connect', () => {
            console.log('Socket connected:', socket.id);
        });

        socket.on('disconnect', () => {
            console.log('Socket disconnected');
        });

        socket.on('connect_error', (err) => {
            console.error('Socket connect error:', err.message);
        });
    }
    return socket;
};

export const disconnectSocket = () => {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
};