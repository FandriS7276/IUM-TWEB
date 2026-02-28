// After successfully saving the new review
const { updateMovieStats } = require('../services/statsCache');
await updateMovieStats(newReview.movie_title);   // ← trigger refresh for this movie only



await client.hIncrBy(`movie:stats:${newReview.movie_title}`, 'totalReviews', 1);
if (newReview.review_type === 'Fresh') {
    await client.hIncrBy(`movie:stats:${newReview.movie_title}`, 'freshCount', 1);
}
else if (newReview.review_type === 'Rotten') {
    await client.hIncrBy(`movie:stats:${newReview.movie_title}`, 'rottenCount', 1);
}
// etc. for rottenCount, topCriticFresh if applicable