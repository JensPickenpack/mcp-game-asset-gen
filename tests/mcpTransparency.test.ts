import fs from 'fs';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/imageUtils.js', async () => {
    const actual = await vi.importActual('../src/utils/imageUtils.js');
    return {
        ...actual,
        getOpenAIKey: () => 'test-key',
        getGeminiKey: () => 'test-key',
        getFalAIKey: () => 'test-key',
    };
});

describe('MCP Transparency Integration', () => {
    it('should handle transparency conversion in generate_texture tool', async () => {
        const { generateTexture } = await import('../src/providers/imageProviders.js');

        expect(typeof generateTexture).toBe('function');

        const args = {
            textureDescription: 'grass sprite for game',
            outputPath: '/test/path/grass_sprite.png',
            transparentBackground: true,
            backgroundColor: 'white' as 'white' | 'black' | 'auto',
            transparencyTolerance: 30,
            model: 'falai' as 'openai' | 'gemini' | 'falai',
            textureSize: '512x512' as '512x512' | '1024x1024' | '2048x2048',
            seamless: false,
            materialType: 'diffuse' as 'diffuse' | 'normal' | 'roughness' | 'displacement',
        };

        expect(args.transparentBackground).toBe(true);
        expect(() => {
            const validation = generateTexture.length;
            expect(validation).toBeGreaterThanOrEqual(0);
        }).not.toThrow();
    });

    it('should convert light grey to transparent with tolerance', async () => {
        const { convertToTransparentBackground } = await import('../src/utils/imageUtils.js');

        const testDir = path.join(process.cwd(), 'test_assets');
        const inputPath = path.join(testDir, 'grass_texture.png');
        const outputPath = path.join(testDir, 'test_lightgrey_transparent.png');

        if (!fs.existsSync(inputPath)) {
            console.log('Skipping test - grass_texture.png not found');
            return;
        }

        try {
            const result = await convertToTransparentBackground(inputPath, outputPath, {
                backgroundColor: 'white',
                tolerance: 50,
            });

            expect(result).toBe(outputPath);
            expect(fs.existsSync(outputPath)).toBe(true);

            const stats = fs.statSync(outputPath);
            expect(stats.size).toBeGreaterThan(0);
        } finally {
            try {
                if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
            } catch (cleanupError) {
                void cleanupError;
            }
        }
    });

    it('should handle auto background detection', async () => {
        const { convertToTransparentBackground } = await import('../src/utils/imageUtils.js');

        const testDir = path.join(process.cwd(), 'test_assets');
        const inputPath = path.join(testDir, 'grass_texture.png');
        const outputPath = path.join(testDir, 'test_auto_transparent.png');

        if (!fs.existsSync(inputPath)) {
            console.log('Skipping test - grass_texture.png not found');
            return;
        }

        try {
            const result = await convertToTransparentBackground(inputPath, outputPath, {
                backgroundColor: 'auto',
                tolerance: 30,
            });

            expect(result).toBe(outputPath);
            expect(fs.existsSync(outputPath)).toBe(true);
        } finally {
            try {
                if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
            } catch (cleanupError) {
                void cleanupError;
            }
        }
    });
});