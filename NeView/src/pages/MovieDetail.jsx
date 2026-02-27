import { useParams } from 'react-router-dom';
import { useSocketChat } from '../hooks/useSocketChat';
import { useState } from 'react';

export default function MovieDetail() {
    const { movieTitle } = useParams(); // or from route
    const { messages, sendMessage } = useSocketChat(movieTitle);
    const [input, setInput] = useState('');

    const handleSend = () => {
        if (input.trim()) {
            sendMessage(input, 'Current User'); // replace with real user later
            setInput('');
        }
    };

    return (
        <div>
            <h1>{movieTitle} Chat</h1>
            <div className="chat-box">
                {messages.map((msg, i) => (
                    <div key={i}>
                        <strong>{msg.user}:</strong> {msg.message}
                        <small>{new Date(msg.timestamp).toLocaleTimeString()}</small>
                    </div>
                ))}
            </div>
            <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type a message..."
            />
            <button onClick={handleSend}>Send</button>
        </div>
    );
}