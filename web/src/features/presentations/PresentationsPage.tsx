import { Link } from 'react-router-dom';

interface PresentationMeta {
  id: string;
  title: string;
  description: string;
}

// Presentation registry - add new presentations here
const presentations: PresentationMeta[] = [
  {
    id: 'game-overview',
    title: 'Open Auto Battler Overview',
    description: 'Introduction to Open Auto Battler for team members',
  },
];

export default function PresentationsPage() {
  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-2">Presentations</h1>
        <p className="text-gray-400 mb-8">Slide decks for Open Auto Battler</p>

        <div className="grid gap-4">
          {presentations.map((p) => (
            <Link
              key={p.id}
              to={`/presentations/${p.id}`}
              className="block p-6 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
            >
              <h2 className="text-xl font-semibold mb-2">{p.title}</h2>
              <p className="text-gray-400">{p.description}</p>
            </Link>
          ))}
        </div>

        <Link
          to="/"
          className="inline-block mt-8 text-blue-400 hover:text-blue-300"
        >
          ← Back to Home
        </Link>
      </div>
    </div>
  );
}
