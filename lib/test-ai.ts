import { analyzeAndGenerateTurn } from './ai-engine';

async function runTest() {
    console.log('📡 Sending test dialogue turn to Gemini...');

    // Created a mock scenario object matching the new signature requirements
    const mockScenario = {
        id: 1,
        context: 'At a cafe ordering coffee.',
        learningGoals: 'Practice ordering a hot latte using polite language.',
        aiCharacterName: 'Mori',
        aiCharacterRole: 'Cafe Barista',
        userCharacterName: 'Amina',
        userCharacterRole: 'Customer'
    };

    try {
        const result = await analyzeAndGenerateTurn(
            'すみません、ホットラテをください。', // User Input
            1, // Current Turn
            mockScenario,
            [], // No structured goals for test
            []  // No completed goals
        );

        console.log('✅ AI response test successful!');
        console.log('Evaluation:', JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('❌ Test execution failed:', error);
    }
}

// Only run the test if called directly (e.g., via tsx/ts-node)
if (require.main === module) {
    runTest();
}