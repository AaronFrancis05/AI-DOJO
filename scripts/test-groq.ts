import 'dotenv/config';
import { createGroqProvider } from '../lib/ai-providers/groq';

async function main() {
  console.log('🧪 Testing Groq provider (via OpenAI SDK)...\n');

  const provider = createGroqProvider();
  console.log('Provider:', provider.name);

  const system = `You are a helpful assistant. Respond in valid JSON with a "reply" field.`;
  const history = [{ role: 'user' as const, content: 'Say hi in Japanese as JSON.' }];

  try {
    const raw = await provider.generateJSON(system, history);
    const parsed = JSON.parse(raw);
    console.log('✅ SUCCESS — Groq provider responded:');
    console.log(JSON.stringify(parsed, null, 2));
  } catch (err: any) {
    console.error('❌ FAILED:', err.message ?? err);
    process.exit(1);
  }
}

main();
