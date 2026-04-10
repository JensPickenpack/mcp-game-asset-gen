import { writeFileSync } from 'fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { ppqaiTextToSpeech, ppqaiTranscribeAudio } from '../../src/providers/audioHelpers.js';
import {
    defaultTestTimeoutMs,
    getScenarioFiles,
    isReusableArtifact,
    logIntegrationSuiteStart,
    maybeCleanupArtifactDir,
    persistArtifact,
    readManifest,
    shouldRunIntegrationTests,
    shouldRunTool,
    withCachedArtifact,
} from './shared.js';

describe('Integration Tests - PPQ.ai Audio Tool Calls', () => {
    beforeAll(() => {
        logIntegrationSuiteStart();
    });

    it('tests ppqai_text_to_speech and keeps the generated audio for later review', async () => {
        if (!shouldRunIntegrationTests || !shouldRunTool('ppqai_text_to_speech')) {
            console.log('Skipping ppqai_text_to_speech integration test');
            return;
        }

        const files = getScenarioFiles('ppqai_text_to_speech', 'narration', 'narration.mp3');
        const input = 'The rift choir rises beneath the tower, and every lantern answers in unison.';

        const manifest = await withCachedArtifact('ppqai_text_to_speech', 'narration', files, async () => {
            const raw = await ppqaiTextToSpeech({
                input,
                outputPath: files.outputPath,
                voice: 'aura-2-apollo-en',
            });

            const parsed = JSON.parse(raw) as Record<string, unknown>;
            return persistArtifact('ppqai_text_to_speech', 'narration', files.metadataPath, input, parsed, [files.outputPath], {
                notes: ['This audio file is also reused as the STT input to avoid another media-generation call.'],
            });
        });

        expect(manifest.parsedResult.operation).toBe('text_to_speech');
        expect(manifest.parsedResult.voice).toBe('aura-2-apollo-en');
        maybeCleanupArtifactDir(files.dir);
    }, defaultTestTimeoutMs);

    it('tests ppqai_transcribe_audio against the stored TTS sample', async () => {
        if (!shouldRunIntegrationTests || !shouldRunTool('ppqai_transcribe_audio')) {
            console.log('Skipping ppqai_transcribe_audio integration test');
            return;
        }

        const ttsFiles = getScenarioFiles('ppqai_text_to_speech', 'narration', 'narration.mp3');
        const ttsManifest = readManifest(ttsFiles.metadataPath);
        if (!isReusableArtifact(ttsManifest)) {
            throw new Error('TTS artifact is required before ppqai_transcribe_audio can run.');
        }

        const files = getScenarioFiles('ppqai_transcribe_audio', 'narration-stt', 'transcription.txt');
        const manifest = await withCachedArtifact('ppqai_transcribe_audio', 'narration-stt', files, async () => {
            const raw = await ppqaiTranscribeAudio({
                filePath: ttsManifest.outputPaths[0],
                model: 'nova-3',
                language: 'en',
                prompt: 'Fantasy tower defense narrator voice.',
            });

            const parsed = JSON.parse(raw) as Record<string, unknown>;
            writeFileSync(files.outputPath, String(parsed.text || ''));
            return persistArtifact('ppqai_transcribe_audio', 'narration-stt', files.metadataPath, String(parsed.input_file || ttsManifest.outputPaths[0]), parsed, [files.outputPath], {
                notes: ['Text transcript is materialized into a .txt file for quick manual review.'],
            });
        });

        expect(manifest.parsedResult.operation).toBe('speech_to_text');
        expect(String(manifest.parsedResult.text || '').length).toBeGreaterThan(10);
        maybeCleanupArtifactDir(files.dir);
    }, defaultTestTimeoutMs);
});
