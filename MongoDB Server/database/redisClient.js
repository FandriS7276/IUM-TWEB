const redis = require('redis');
require('dotenv').config();

const client = redis.createClient({
    url: process.env.REDIS_URL,
    socket: {
        reconnectStrategy: (retries) => Math.min(retries * 100, 3000), // exponential backoff
    },
});

client.on('error', (err) => console.error('Redis Client Error', err));
client.on('connect', () => console.log('Redis connected 🔥'));
client.on('reconnecting', () => console.log('Redis reconnecting...'));

// Connect on startup
(async () => {
    await client.connect();
})();

module.exports = client;