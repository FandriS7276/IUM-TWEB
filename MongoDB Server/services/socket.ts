/**
 * services/socket.ts — Socket.IO server for real-time movie chat rooms.
 *
 * Each movie has its own chat room identified by `movie-{title}`. Users join
 * a room via the `joinMovie` event and broadcast messages via `chatMessage`.
 * The server relays messages to everyone in the same room (including the sender).
 *
 * The module uses a singleton pattern: `initSocket` creates the server once and
 * returns the same instance on subsequent calls, so importing this module in
 * multiple places doesn't accidentally create multiple Socket.IO servers.
 *
 * TODO: add JWT-based socket authentication so only logged-in users can chat.
 */

// Server as HttpServer: Node's built-in http.Server — needed to attach Socket.IO
// alongside Express on the same port without running two separate servers
import { Server as SocketServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import corsOptions from '../config/cors';

let io: SocketServer | null = null;

/**
 * Attaches a Socket.IO server to the provided HTTP server and registers
 * all event handlers. Safe to call multiple times — returns the existing
 * instance if already initialised.
 */
export function initSocket(server: HttpServer): SocketServer {
    if (io) return io;

    io = new SocketServer(server, {
        // Reuse the same CORS policy as the REST API
        cors: corsOptions as object
    });

    io.on('connection', (socket) => {
        console.log('User connected:', socket.id);

        // Client sends { movieTitle } to subscribe to a movie's chat room
        socket.on('joinMovie', (movieTitle: string) => {
            if (!movieTitle) return;
            const room = `movie-${movieTitle.trim()}`;
            socket.join(room);
            console.log(`${socket.id} joined ${room}`);
            // Confirm to the client that they successfully joined
            socket.emit('joined', { message: `Welcome to ${movieTitle} chat` });
        });

        // Client sends movieTitle to unsubscribe from a movie's chat room.
        // Without this handler the socket would remain in the room server-side
        // even after the frontend component unmounts, causing stale broadcasts
        // and a slow server-side room-membership leak.
        socket.on('leaveMovie', (movieTitle: string) => {
            if (!movieTitle) return;
            const room = `movie-${movieTitle.trim()}`;
            socket.leave(room);
            console.log(`${socket.id} left ${room}`);
        });

        // Client sends { movieTitle, message, user } to post a chat message
        socket.on('chatMessage', ({
            movieTitle, message, user
        }: { movieTitle: string; message: string; user: string }) => {
            if (!movieTitle || !message || !user) return;
            const room = `movie-${movieTitle.trim()}`;
            // Broadcast to ALL clients in the room, including the sender
            io!.to(room).emit('chatMessage', {
                user,
                message,
                timestamp: new Date().toISOString()
            });
        });

        socket.on('disconnect', () => {
            console.log('User', socket.id, 'disconnected');
        });

        socket.on('error', (err: Error) => {
            console.error('Socket error:', err);
        });
    });

    return io;
}
