import { writeFileSync } from 'fs';
import path from 'path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
    generateCharacterSheet,
    generateObjectSheet,
    generatePixelArtCharacter,
    generateTexture,
    ppqaiGenerateImage,
    ppqaiTransformImage,
} from '../../src/providers/imageProviders.js';
import {
    baseImageScenarioName,
    defaultTestTimeoutMs,
    ensureDir,
    extendedTestTimeoutMs,
    forceRefreshArtifacts,
    getDesiredImageQuality,
    getScenarioFiles,
    isReusableArtifact,
    logIntegrationSuiteStart,
    maybeCleanupArtifactDir,
    persistArtifact,
    qualityTier,
    readManifest,
    shouldRunIntegrationTests,
    shouldRunTool,
    smokeImageModels,
    smokeTransformModel,
    toSafeSlug,
    withCachedArtifact,
} from './shared.js';

describe('Integration Tests - PPQ.ai Image Tool Calls', () => {
    beforeAll(() => {
        logIntegrationSuiteStart();
    });

    it('tests ppqai_generate_image across allowed text models (excluding gpt-image-1) with reusable artifacts', async () => {
        if (!shouldRunIntegrationTests || !shouldRunTool('ppqai_generate_image')) {
            console.log('Skipping ppqai_generate_image integration test');
            return;
        }

        expect(smokeImageModels.length).toBeGreaterThan(0);

        const prompt = 'Top-down tower defense nexus marker, occult stone circle with a soft cyan core, isolated asset, readable silhouette';
        const failedModels: string[] = [];
        let successfulModels = 0;
        for (const model of smokeImageModels) {
            const modelSlug = toSafeSlug(model);
            const scenarioName = `base-image-${modelSlug}`;
            const files = getScenarioFiles('ppqai_generate_image', scenarioName, `cryptid_nexus_${modelSlug}.png`);
            const desiredQuality = getDesiredImageQuality(model);
            const existingManifest = readManifest(files.metadataPath);

            // Keep paid calls minimal: if a valid positive artifact already exists, do not call the API again.
            if (!forceRefreshArtifacts && isReusableArtifact(existingManifest)) {
                successfulModels += 1;
                continue;
            }

            try {
                const manifest = await withCachedArtifact('ppqai_generate_image', scenarioName, files, async () => {
                    const raw = await ppqaiGenerateImage({
                        prompt,
                        outputPath: files.outputPath,
                        model: model as any,
                        quality: desiredQuality,
                        size: '1024x1024',
                        n: 1,
                    });

                    const parsed = JSON.parse(raw) as Record<string, unknown>;
                    const outputPaths = (parsed.savedPaths as string[]) || [files.outputPath];
                    return persistArtifact('ppqai_generate_image', scenarioName, files.metadataPath, prompt, parsed, outputPaths, {
                        notes: [
                            `Model smoke test artifact for ${model}.`,
                            `Requested quality: ${desiredQuality || 'provider-default'}.`,
                            `Quality tier: ${qualityTier}.`,
                        ],
                    });
                });

                expect(manifest.parsedResult.provider).toBe('PPQ.ai');
                expect(manifest.sourceModel).toBe(model);
                successfulModels += 1;
            } catch (error) {
                failedModels.push(model);
                ensureDir(files.dir);
                writeFileSync(
                    path.join(files.dir, 'result.error.json'),
                    JSON.stringify(
                        {
                            tool: 'ppqai_generate_image',
                            scenario: scenarioName,
                            model,
                            requestedQuality: desiredQuality || 'provider-default',
                            qualityTier,
                            error: error instanceof Error ? error.message : String(error),
                            generatedAt: new Date().toISOString(),
                        },
                        null,
                        2
                    )
                );
            }
        }

        if (failedModels.length > 0) {
            console.warn(`ppqai_generate_image failed for models: ${failedModels.join(', ')}`);
        }
        expect(successfulModels).toBeGreaterThan(0);
    }, defaultTestTimeoutMs);

    it('tests ppqai-transform_image with a reusable base image and i2i model metadata', async () => {
        if (!shouldRunIntegrationTests || !shouldRunTool('ppqai-transform_image')) {
            console.log('Skipping ppqai-transform_image integration test');
            return;
        }

        if (smokeTransformModel === 'disabled') {
            console.log('Skipping ppqai-transform_image integration test: transform model temporarily disabled');
            return;
        }

        const baseModelSlug = toSafeSlug(smokeImageModels[0] || 'gpt-image-1.5');
        const baseImageFiles = getScenarioFiles('ppqai_generate_image', baseImageScenarioName, `cryptid_nexus_${baseModelSlug}.png`);
        let baseManifest = readManifest(baseImageFiles.metadataPath);

        if (!isReusableArtifact(baseManifest)) {
            baseManifest = await withCachedArtifact('ppqai_generate_image', baseImageScenarioName, baseImageFiles, async () => {
                const seedPrompt = 'Top-down tower defense nexus marker, occult stone circle with a soft cyan core, isolated asset, readable silhouette';
                const seedModel = smokeImageModels[0] || 'gpt-image-1.5';
                const raw = await ppqaiGenerateImage({
                    prompt: seedPrompt,
                    outputPath: baseImageFiles.outputPath,
                    model: seedModel as any,
                    quality: getDesiredImageQuality(seedModel),
                    size: '1024x1024',
                    n: 1,
                });

                const parsed = JSON.parse(raw) as Record<string, unknown>;
                const outputPaths = (parsed.savedPaths as string[]) || [baseImageFiles.outputPath];
                return persistArtifact('ppqai_generate_image', baseImageScenarioName, baseImageFiles.metadataPath, seedPrompt, parsed, outputPaths, {
                    notes: ['Seed artifact created for ppqai-transform_image integration coverage.'],
                });
            });
        }

        if (!isReusableArtifact(baseManifest)) {
            throw new Error('Reusable base image artifact is required for ppqai-transform_image test.');
        }

        const modelSlug = toSafeSlug(smokeTransformModel);
        const scenarioName = `nexus-transform-${modelSlug}`;
        const files = getScenarioFiles('ppqai-transform_image', scenarioName, `cryptid_nexus_corrupted_${modelSlug}.png`);
        const transformPrompt = 'Convert this nexus marker into a corrupted late-wave variant with cracked obsidian fins, crimson runes, and harsher contrast';

        const manifest = await withCachedArtifact('ppqai-transform_image', scenarioName, files, async () => {
            const raw = await ppqaiTransformImage({
                prompt: transformPrompt,
                outputPath: files.outputPath,
                inputImagePath: baseManifest.outputPaths[0],
                model: smokeTransformModel as any,
                size: '1024x1024',
            });

            const parsed = JSON.parse(raw) as Record<string, unknown>;
            const outputPaths = (parsed.savedPaths as string[]) || [files.outputPath];
            return persistArtifact('ppqai-transform_image', scenarioName, files.metadataPath, transformPrompt, parsed, outputPaths, {
                sourceModel: smokeTransformModel,
                notes: ['Uses cached base-image artifact as i2i source to avoid duplicate paid generation.'],
            });
        });

        expect(manifest.parsedResult.provider).toBe('PPQ.ai');
        expect(manifest.parsedResult.operation).toBe('transform_image');
        expect(manifest.sourceModel).toBe(smokeTransformModel);
        maybeCleanupArtifactDir(files.dir);
    }, defaultTestTimeoutMs);

    it('tests generate_character_sheet without mocks and keeps inspectable metadata', async () => {
        if (!shouldRunIntegrationTests || !shouldRunTool('generate_character_sheet')) {
            console.log('Skipping generate_character_sheet integration test');
            return;
        }

        const files = getScenarioFiles('generate_character_sheet', 'cultist-sheet', 'cultist_sheet.png');
        const characterDescription = 'A hooded cryptid hunter with a lantern and iron charm necklace';
        const existingManifest = readManifest(files.metadataPath);

        if (!forceRefreshArtifacts && isReusableArtifact(existingManifest)) {
            expect(existingManifest.parsedResult.operation).toBe('character_sheet_generation');
            expect(existingManifest.sourceModel).toBe('gpt-image-1.5');
            return;
        }

        const manifest = await withCachedArtifact('generate_character_sheet', 'cultist-sheet', files, async () => {
            const raw = await generateCharacterSheet({
                characterDescription,
                outputPath: files.outputPath,
                style: 'gothic game concept sheet',
                includeExpressions: false,
                includePoses: false,
                model: 'gpt-image-1.5',
            });

            const parsed = JSON.parse(raw) as Record<string, unknown>;
            const outputPaths = (parsed.savedPaths as string[]) || [files.outputPath];
            return persistArtifact(
                'generate_character_sheet',
                'cultist-sheet',
                files.metadataPath,
                characterDescription,
                parsed,
                outputPaths,
                {
                    notes: ['Single low-cost representative sample for the character sheet tool.'],
                }
            );
        });

        expect(manifest.parsedResult.operation).toBe('character_sheet_generation');
        expect(manifest.sourceModel).toBe('gpt-image-1.5');
        maybeCleanupArtifactDir(files.dir);
    }, defaultTestTimeoutMs);

    it('tests generate_pixel_art_character and preserves the produced sprite artifact', async () => {
        if (!shouldRunIntegrationTests || !shouldRunTool('generate_pixel_art_character')) {
            console.log('Skipping generate_pixel_art_character integration test');
            return;
        }

        const files = getScenarioFiles('generate_pixel_art_character', 'warden-sprite', 'rift_warden.png');
        const characterDescription = 'A raven-masked warden carrying a silver pike';
        const existingManifest = readManifest(files.metadataPath);

        if (!forceRefreshArtifacts && isReusableArtifact(existingManifest)) {
            expect(existingManifest.parsedResult.operation).toBe('pixel_art_generation');
            return;
        }

        const manifest = await withCachedArtifact('generate_pixel_art_character', 'warden-sprite', files, async () => {
            const raw = await generatePixelArtCharacter({
                characterDescription,
                outputPath: files.outputPath,
                pixelDimensions: '32x32',
                model: 'gpt-image-1.5',
                transparentBackground: true,
                backgroundColor: 'white',
            });

            const parsed = JSON.parse(raw) as Record<string, unknown>;
            const savedPaths = (parsed.savedPaths as string[]) || [];
            const tempPath = typeof parsed.temp_path === 'string' ? parsed.temp_path : undefined;
            const outputPaths = tempPath ? Array.from(new Set([...savedPaths, tempPath])) : savedPaths;
            return persistArtifact(
                'generate_pixel_art_character',
                'warden-sprite',
                files.metadataPath,
                characterDescription,
                parsed,
                outputPaths,
                {
                    notes: ['Tool currently returns the generated 256px staging sprite as the inspectable artifact.'],
                }
            );
        });

        expect(manifest.parsedResult.operation).toBe('pixel_art_generation');
        maybeCleanupArtifactDir(files.dir);
    }, defaultTestTimeoutMs);

    it('tests generate_texture with a saved texture sample and manifest', async () => {
        if (!shouldRunIntegrationTests || !shouldRunTool('generate_texture')) {
            console.log('Skipping generate_texture integration test');
            return;
        }

        const files = getScenarioFiles('generate_texture', 'moss-floor', 'moss_floor.png');
        const textureDescription = 'Wet occult stone floor with moss in the cracks';
        const existingManifest = readManifest(files.metadataPath);

        if (!forceRefreshArtifacts && isReusableArtifact(existingManifest)) {
            expect(existingManifest.parsedResult.operation).toBe('texture_generation');
            return;
        }

        const manifest = await withCachedArtifact('generate_texture', 'moss-floor', files, async () => {
            const raw = await generateTexture({
                textureDescription,
                outputPath: files.outputPath,
                textureSize: '1024x1024',
                seamless: true,
                model: 'gpt-image-1.5',
                materialType: 'diffuse',
            });

            const parsed = JSON.parse(raw) as Record<string, unknown>;
            const outputPaths = (parsed.savedPaths as string[]) || [files.outputPath];
            return persistArtifact('generate_texture', 'moss-floor', files.metadataPath, textureDescription, parsed, outputPaths);
        });

        expect(manifest.parsedResult.operation).toBe('texture_generation');
        maybeCleanupArtifactDir(files.dir);
    }, defaultTestTimeoutMs);

    it('tests generate_object_sheet with a minimized two-view sample', async () => {
        if (!shouldRunIntegrationTests || !shouldRunTool('generate_object_sheet')) {
            console.log('Skipping generate_object_sheet integration test');
            return;
        }

        const files = getScenarioFiles('generate_object_sheet', 'spawner-sheet', 'spawner_sheet.png');
        const objectDescription = 'A ritual portal spawner built from black stone and copper runes';
        const existingManifest = readManifest(files.metadataPath);

        if (!forceRefreshArtifacts && isReusableArtifact(existingManifest)) {
            expect(existingManifest.parsedResult.operation).toBe('object_sheet_generation');
            expect(existingManifest.outputPaths.length).toBe(2);
            return;
        }

        const manifest = await withCachedArtifact('generate_object_sheet', 'spawner-sheet', files, async () => {
            const raw = await generateObjectSheet({
                objectDescription,
                outputBasePath: files.outputPath,
                viewpoints: ['front', 'perspective'],
                model: 'gpt-image-1.5',
                style: 'technical game concept art',
            });

            const parsed = JSON.parse(raw) as Record<string, unknown>;
            const outputPaths = ((parsed.saved_paths as string[]) || []) as string[];
            return persistArtifact('generate_object_sheet', 'spawner-sheet', files.metadataPath, objectDescription, parsed, outputPaths, {
                sourceModel: 'gpt-image-1.5',
                notes: ['Viewpoints intentionally reduced to front + perspective to reduce PPQ cost.'],
            });
        });

        expect(manifest.parsedResult.operation).toBe('object_sheet_generation');
        expect(manifest.outputPaths.length).toBe(2);
        maybeCleanupArtifactDir(files.dir);
    }, extendedTestTimeoutMs);
});
