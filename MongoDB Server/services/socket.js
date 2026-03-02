const { Server } = require('socket.io');
const corsOptions = require('../config/cors');

let io = null;

// TODO - add auth to sockets and frontend URL

function initSocket(server) {
    if (io) return io; // singleton - don't recreate if already initialized

    io = new Server(server, {
        cors: corsOptions
    });

    // Socket.IO event listeners
    io.on('connection', (socket) => {
        console.log('User connected:', socket.id);

        socket.on('joinMovie', (movieTitle) => {
            if (!movieTitle)
                return;
            const room = `movie-${movieTitle.trim()}`;
            socket.join(room);
            console.log(`${socket.id} joined ${room}`);
            socket.emit('joined', { message: `Welcome to ${movieTitle} chat` });
        });

        socket.on('chatMessage', ({ movieTitle, message, user }) => {
            if (!movieTitle || !message || !user)
                return;
            const room = `movie-${movieTitle.trim()}`;
            io.to(room).emit('chatMessage', {
                user,
                message,
                timestamp: new Date().toISOString()
            });
        });

        socket.on('disconnect', () => {
            console.log('User ', socket.id, ' disconnected');
        });

        socket.on('error', (err) => {
            console.error('Socket error:', err);
        });
    });

    return io;
}

module.exports = { initSocket };