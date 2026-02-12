async function fetchDataRotten() {
    const element = document.getElementById('dataRotten');
    if (!element) {
        console.warn('Element #dataRotten not found in DOM');
        return;
    }
    element.innerText = 'Loading Rotten Tomatoes data...'; // Loading state

    try {
        const response = await fetch('/api/dataRotten');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();
        if (data.success) {
            element.innerText = JSON.stringify(data.data, null, 2); // Pretty JSON for now
            // TODO: Render as UI, e.g., data.data.forEach(movie => renderMovieCard(movie));
        } else {
            element.innerText = `API Error: ${data.message || 'Unknown failure'}`;
        }
    } catch (err) {
        console.error('Fetch error:', err);
        element.innerText = `Failed to fetch: ${err.message}`;
    }
}

async function fetchDataOscarAwards() {
    // Same pattern as above, but for #dataOscars and /api/dataOscar
    const element = document.getElementById('dataOscars');
    if (!element) return console.warn('Element #dataOscars not found');
    element.innerText = 'Loading Oscar data...';

    try {
        const response = await fetch('/api/dataOscar');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (data.success) {
            element.innerText = JSON.stringify(data.data, null, 2);
        } else {
            element.innerText = `API Error: ${data.message || 'Failed'}`;
        }
    } catch (err) {
        console.error('Fetch error:', err);
        element.innerText = `Failed to fetch: ${err.message}`;
    }
}

// Auto-call on load, or hook to buttons
document.addEventListener('DOMContentLoaded', () => {
    fetchDataRotten();
    fetchDataOscarAwards();
});