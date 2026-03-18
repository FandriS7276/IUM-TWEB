/**
 * AwardsPage
 * -----------
 * Displays Oscar award data from the backend. Falls back to
 * placeholder data when the API isn't available.
 */
import { useState } from 'react';
import { Award, Trophy } from '../components/Icons';
import './AwardsPage.css';

// Placeholder Oscar data matching the backend schema
const PLACEHOLDER_OSCARS = [
  { film: 'Oppenheimer', year_film: 2023, winsCount: 7, totalNominations: 13, awards: [{ category: 'BEST PICTURE', winner: true }, { category: 'BEST DIRECTOR', winner: true, name: 'Christopher Nolan' }] },
  { film: 'Everything Everywhere All at Once', year_film: 2022, winsCount: 7, totalNominations: 11, awards: [{ category: 'BEST PICTURE', winner: true }, { category: 'BEST DIRECTOR', winner: true, name: 'Daniel Kwan, Daniel Scheinert' }] },
  { film: 'CODA', year_film: 2021, winsCount: 3, totalNominations: 3, awards: [{ category: 'BEST PICTURE', winner: true }] },
  { film: 'Nomadland', year_film: 2020, winsCount: 3, totalNominations: 6, awards: [{ category: 'BEST PICTURE', winner: true }, { category: 'BEST DIRECTOR', winner: true, name: 'Chloe Zhao' }] },
  { film: 'Parasite', year_film: 2019, winsCount: 4, totalNominations: 6, awards: [{ category: 'BEST PICTURE', winner: true }, { category: 'BEST DIRECTOR', winner: true, name: 'Bong Joon-ho' }] },
  { film: 'Green Book', year_film: 2018, winsCount: 3, totalNominations: 5, awards: [{ category: 'BEST PICTURE', winner: true }] },
];

export default function AwardsPage() {
  const [tab, setTab] = useState('winners');

  return (
    <main className="awards-page">
      <div className="container">
        <div className="awards-page__header">
          <Trophy size={28} />
          <h1 className="awards-page__title">Academy Awards</h1>
        </div>

        <div className="awards-tabs">
          <button className={`awards-tab ${tab === 'winners' ? 'awards-tab--active' : ''}`} onClick={() => setTab('winners')}>
            Best Picture Winners
          </button>
          <button className={`awards-tab ${tab === 'controversial' ? 'awards-tab--active' : ''}`} onClick={() => setTab('controversial')}>
            Controversial
          </button>
          <button className={`awards-tab ${tab === 'snubbed' ? 'awards-tab--active' : ''}`} onClick={() => setTab('snubbed')}>
            Snubbed
          </button>
        </div>

        <div className="awards-grid">
          {PLACEHOLDER_OSCARS.map((entry) => (
            <div key={entry.film} className="award-card">
              <div className="award-card__year">{entry.year_film}</div>
              <div className="award-card__info">
                <h3 className="award-card__film">{entry.film}</h3>
                <div className="award-card__stats">
                  <span className="award-card__wins">
                    <Award size={14} /> {entry.winsCount} wins
                  </span>
                  <span className="award-card__noms">
                    {entry.totalNominations} nominations
                  </span>
                </div>
                <div className="award-card__categories">
                  {entry.awards.slice(0, 3).map((a, i) => (
                    <span key={i} className={`award-card__cat ${a.winner ? 'award-card__cat--won' : ''}`}>
                      {a.category}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        <p className="awards-page__note">
          Showing placeholder data. Full Oscar history will load from the API once the backend is running.
        </p>
      </div>
    </main>
  );
}
