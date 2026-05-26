import { useEffect, useState, useRef } from 'react';
import { getSocket } from '../services/socket';

export const useSocketChat = (movieTitle) => {
    const [messages, setMessages] = useState([]);
    const socketRef = useRef(null);

    useEffect(() => {
            if (!movieTitle) return;

            socketRef.current = getSocket();

            // Connect if not connected
            if (!socketRef.current.connected) {
                socketRef.current.connect();
            }

            // Join movie room
            socketRef.current.emit('joinMovie', movieTitle);

            // Listen for new messages
            socketRef.current.on('chatMessage', (msg) => {
                setMessages((prev) => [...prev, msg]);
            });

            // Cleanup on unmount or movie change
            return () => {
                socketRef.current.emit('leaveMovie', movieTitle); // optional: tell server
                socketRef.current.off('chatMessage');
                // Don't disconnect here — keep connection alive for other movies
            };
        },
        [movieTitle]
    );

    // Send message function
    const sendMessage = (message, user) => {
        if (socketRef.current && socketRef.current.connected) {
            socketRef.current.emit('chatMessage', { movieTitle, message, user });
        }
    };

    return { messages, sendMessage };
};