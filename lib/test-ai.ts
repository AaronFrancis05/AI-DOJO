import { analyzeDynamicUserTurn } from './ai-engine';

async function runTest() {
    console.log('📡 Sending test dialogue turn to Gemini...');
    try {
        const result = await analyzeDynamicUserTurn(
            'はじめまして、私はアミナです。ウガンダから来ました。よろしくおねがいします。', // User input
            'Amina launches the JapanBridge app for the first time and is greeted by Hana, an AI Japanese tutor.', // Scenario context
            'Learn hajimemashite, yoroshiku onegaishimasu, and basic name introductions.' // Learning goals
        );

        console.log('✅ Success! Machine Learning analysis returned:');
        console.log(JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

runTest();