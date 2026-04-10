import { existsSync } from 'fs';
import path from 'path';
import { beforeAll, describe, expect, it } from 'vitest';
import { ppqaiGenerateVideoAsync } from '../../src/providers/videoHelpers.js';
import {
    ensureDir,
    forceRefreshArtifacts,
    getScenarioFiles,
    isReusableArtifact,
    logIntegrationSuiteStart,
    maybeCleanupArtifactDir,
    persistArtifact,
    readManifest,
    shouldRunIntegrationTests,
    shouldRunTool,
    validateOutputFiles,
    videoPollTimeoutMs,
    videoTestTimeoutMs,
    waitForVideoCompletion,
    writeManifest,
    type ArtifactManifest,
} from './shared.js';

describe('Integration Tests - PPQ.ai Video Tool Calls', () => {
    beforeAll(() => {
        logIntegrationSuiteStart();
    });

    it('tests ppqai_generate_video and waits for a single low-cost completion artifact', async () => {
        if (!shouldRunIntegrationTests || !shouldRunTool('ppqai_generate_video')) {
            console.log('Skipping ppqai_generate_video integration test');
            return;
        }

        const files = getScenarioFiles('ppqai_generate_video', 'portal-loop', 'portal_loop.mp4');
        const prompt = 'Short looping top-down portal pulse for a gothic tower defense game, isolated on dark background';
        const existingManifest = !forceRefreshArtifacts ? readManifest(files.metadataPath) : null;

        let manifest: ArtifactManifest;
        if (isReusableArtifact(existingManifest) && existingManifest.statusPath && existsSync(existingManifest.statusPath)) {
            manifest = {
                ...existingManifest,
                reused: true,
            };
            writeManifest(manifest);
        } else {
            ensureDir(files.dir);
            const statusPath = path.join(files.dir, 'portal_loop_status.json');
            const submission = await ppqaiGenerateVideoAsync(
                {
                    prompt,
                    outputPath: files.outputPath,
                    model: 'kling-2.5-turbo',
                    aspect_ratio: '1:1',
                    duration: 5,
                },
                statusPath
            );

            const status = await waitForVideoCompletion(submission.statusPath, videoPollTimeoutMs);
            validateOutputFiles([files.outputPath]);

            manifest = persistArtifact(
                'ppqai_generate_video',
                'portal-loop',
                files.metadataPath,
                prompt,
                status,
                [files.outputPath],
                {
                    sourceModel: String((status.result as Record<string, unknown> | undefined)?.model || 'kling-2.5-turbo'),
                    statusPath: submission.statusPath,
                    notes: ['Async status JSON is preserved alongside the rendered video for manual quality review.'],
                }
            );
        }

        expect(manifest.parsedResult.status).toBe('completed');
        maybeCleanupArtifactDir(files.dir);
    }, videoTestTimeoutMs);
});
