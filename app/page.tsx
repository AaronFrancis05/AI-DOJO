import { db } from '../src/db';
import { scenarios } from '../src/schema';
import Link from 'next/link';

async function getRoleplays() {
  try {
    const list = await db.select().from(scenarios);
    return list;
  } catch (error) {
    console.error("Error fetching scenarios:", error);
    return [];
  }
}

export default async function DashboardPage() {
  const roleplays = await getRoleplays();

  return (
      <div style={{ maxWidth: '1000px', margin: '40px auto', padding: '20px', fontFamily: 'sans-serif' }}>
        <header style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h1 style={{ fontSize: '2.5rem', color: '#1a202c', marginBottom: '10px' }}>🥋 AI DOJO — Interactive Japanese Arena</h1>
          <p style={{ color: '#4a5568', fontSize: '1.1rem' }}>
            Select a real-world scenario below to begin your personalized, dynamic AI roleplay session.
          </p>
        </header>

        {roleplays.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', background: '#fff5f5', color: '#c53030', borderRadius: '8px' }}>
              <strong>No scenarios found!</strong> Make sure you have run <code>npm run db:seed</code> to populate your Neon tables.
            </div>
        ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
              {roleplays.map((scenario) => (
                  <div
                      key={scenario.id}
                      style={{
                        border: '1px solid #e2e8f0',
                        borderRadius: '12px',
                        padding: '24px',
                        background: '#fff',
                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between'
                      }}
                  >
                    <div>
                <span style={{
                  background: scenario.difficulty === 'beginner' ? '#e6fffa' : '#feebc8',
                  color: scenario.difficulty === 'beginner' ? '#234e52' : '#744210',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '0.8rem',
                  fontWeight: 'bold',
                  textTransform: 'uppercase'
                }}>
                  {scenario.difficulty}
                </span>

                      <h3 style={{ fontSize: '1.3rem', margin: '12px 0 8px 0', color: '#2d3748' }}>{scenario.title}</h3>
                      <p style={{ color: '#718096', fontSize: '0.9rem', lineHeight: '1.5', height: '90px', overflow: 'hidden' }}>
                        {scenario.context}
                      </p>

                      <div style={{ fontSize: '0.85rem', color: '#4a5568', background: '#f7fafc', padding: '10px', borderRadius: '6px', marginTop: '10px' }}>
                        <strong>🎯 Goal:</strong> {scenario.learningGoals}
                      </div>
                    </div>

                    <Link href={`/chat/${scenario.id}`} style={{ textDecoration: 'none' }}>
                      <button style={{
                        width: '100%',
                        background: '#000',
                        color: '#fff',
                        border: 'none',
                        padding: '12px',
                        borderRadius: '6px',
                        marginTop: '20px',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        fontSize: '1rem'
                      }}>
                        Enter Dojo &rarr;
                      </button>
                    </Link>
                  </div>
              ))}
            </div>
        )}
      </div>
  );
}