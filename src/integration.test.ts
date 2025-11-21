import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, unlinkSync, mkdirSync } from 'fs';
import path from 'path';
import {
  openaiGenerateImage,
  geminiGenerateImage,
  falaiGenerateImage,
  generateCharacterSheet,
  generateTexture,
} from './providers/imageProviders.js';

const testAssetsDir = './test_assets';
const shouldCleanupTestFiles = process.env.CLEANUP_TEST_FILES === 'true';

describe('Integration Tests - Real Provider Calls', () => {
  const shouldRunIntegrationTests = process.env.NO_MOCK_PROVIDERS === 'true';
  
  beforeAll(() => {
    if (!shouldRunIntegrationTests) {
      console.log('Skipping integration tests. Set NO_MOCK_PROVIDERS=true to run them.');
      return;
    }
    
    // Ensure test assets directory exists
    if (!existsSync(testAssetsDir)) {
      mkdirSync(testAssetsDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (shouldCleanupTestFiles) {
      console.log('Cleaning up test files...');
      // Clean up test files if CLEANUP_TEST_FILES=true
      // This is optional since test_assets is gitignored
    }
  });

  const cleanUpTestFile = (filePath: string) => {
    if (shouldCleanupTestFiles && existsSync(filePath)) {
      try {
        unlinkSync(filePath);
        console.log(`Cleaned up test file: ${filePath}`);
      } catch (error) {
        console.warn(`Failed to clean up test file ${filePath}:`, error);
      }
    }
  };

  // Generate unique filename to avoid overwriting
  const generateTestFileName = (baseName: string, extension: string = '.png'): string => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    return `${baseName}_${timestamp}_${randomSuffix}${extension}`;
  };

  // Helper function to check if file exists and has content
  const validateGeneratedFile = (filePath: string) => {
    expect(existsSync(filePath)).toBe(true);
    
    // Check file size (should be greater than 0 for a valid image)
    const stats = require('fs').statSync(filePath);
    expect(stats.size).toBeGreaterThan(0);
    
    // Check file extension
    const ext = path.extname(filePath).toLowerCase();
    expect(['.png', '.jpg', '.jpeg', '.webp']).toContain(ext);
  };

  describe('OpenAI Image Generation', () => {
    it('should generate a simple image with OpenAI', async () => {
      if (!shouldRunIntegrationTests || !process.env.OPENAI_API_KEY) {
        console.log('Skipping OpenAI integration test - NO_MOCK_PROVIDERS not set or OPENAI_API_KEY missing');
        return;
      }

      const outputPath = path.join(testAssetsDir, generateTestFileName('openai_test'));
      
      try {
        const result = await openaiGenerateImage({
          prompt: 'A simple red circle on white background',
          outputPath,
          size: '1024x1024',
          n: 1,
        });

        expect(result).toBeDefined();
        
        const parsed = JSON.parse(result);
        expect(parsed.provider).toBe('OpenAI');
        expect(parsed.savedPaths).toContain(outputPath);
        
        validateGeneratedFile(outputPath);
        
        // Parse the result to verify it contains expected fields
        expect(parsed.operation).toBe('generate');
        expect(parsed.prompt_used).toBe('A simple red circle on white background');
        
        console.log(`OpenAI test image saved to: ${outputPath}`);
        
      } finally {
        cleanUpTestFile(outputPath);
      }
    }, 180000); // 3 minute timeout for API calls
  });

  describe('Gemini Image Generation', () => {
    it('should generate a simple image with Gemini', async () => {
      if (!shouldRunIntegrationTests || !process.env.GEMINI_API_KEY) {
        console.log('Skipping Gemini integration test - NO_MOCK_PROVIDERS not set or GEMINI_API_KEY missing');
        return;
      }

      const outputPath = path.join(testAssetsDir, generateTestFileName('gemini_test'));
      
      try {
        const result = await geminiGenerateImage({
          prompt: 'A simple blue square on white background',
          outputPath,
        });

        expect(result).toBeDefined();
        
        const parsed = JSON.parse(result);
        expect(parsed.provider).toBe('Google Gemini');
        expect(parsed.savedPaths).toContain(outputPath);
        
        validateGeneratedFile(outputPath);
        
        expect(parsed.prompt_used).toBe('A simple blue square on white background');
        
        console.log(`Gemini test image saved to: ${outputPath}`);
        
      } finally {
        cleanUpTestFile(outputPath);
      }
    }, 180000); // 3 minute timeout for API calls
  });

  describe('FAL.ai Image Generation', () => {
    it('should generate a simple image with FAL.ai', async () => {
      if (!shouldRunIntegrationTests || !process.env.FAL_AI_API_KEY) {
        console.log('Skipping FAL.ai integration test - NO_MOCK_PROVIDERS not set or FAL_AI_API_KEY missing');
        return;
      }

      const outputPath = path.join(testAssetsDir, generateTestFileName('falai_test'));
      
      try {
        const result = await falaiGenerateImage({
          prompt: 'A simple green triangle on white background',
          outputPath,
          image_size: 'square_hd',
          num_inference_steps: 10, // Lower for faster testing
        });

        expect(result).toBeDefined();
        
        const parsed = JSON.parse(result);
        expect(parsed.provider).toBe('FAL.ai');
        expect(parsed.model).toBe('qwen-image');
        expect(parsed.savedPaths).toContain(outputPath);
        
        validateGeneratedFile(outputPath);
        
        expect(parsed.prompt_used).toBe('A simple green triangle on white background');
        expect(parsed.seed).toBeDefined();
        
        console.log(`FAL.ai test image saved to: ${outputPath}`);
        
      } finally {
        cleanUpTestFile(outputPath);
      }
    }, 180000); // 3 minute timeout for API calls
  });

  describe('Character Sheet Generation', () => {
    it('should generate a character sheet', async () => {
      if (!shouldRunIntegrationTests || !process.env.GEMINI_API_KEY) {
        console.log('Skipping character sheet integration test - NO_MOCK_PROVIDERS not set or GEMINI_API_KEY missing');
        return;
      }

      const outputPath = path.join(testAssetsDir, generateTestFileName('character_sheet_test'));
      
      try {
        const result = await generateCharacterSheet({
          characterDescription: 'A simple stick figure character',
          outputPath,
          style: 'minimalist line art',
          includeExpressions: false,
          includePoses: false,
        });

        expect(result).toBeDefined();
        
        const parsed = JSON.parse(result);
        expect(parsed.operation).toBe('character_sheet_generation');
        expect(parsed.savedPaths).toContain(outputPath);
        
        validateGeneratedFile(outputPath);
        
        expect(parsed.character_description).toBe('A simple stick figure character');
        
        console.log(`Character sheet test image saved to: ${outputPath}`);
        
      } finally {
        cleanUpTestFile(outputPath);
      }
    }, 180000); // 3 minute timeout for complex generation
  });

  describe('Texture Generation', () => {
    it('should generate a seamless texture', async () => {
      if (!shouldRunIntegrationTests || !process.env.FAL_AI_API_KEY) {
        console.log('Skipping texture integration test - NO_MOCK_PROVIDERS not set or FAL_AI_API_KEY missing');
        return;
      }

      const outputPath = path.join(testAssetsDir, generateTestFileName('texture_test'));
      
      try {
        const result = await generateTexture({
          textureDescription: 'Simple checkerboard pattern',
          outputPath,
          textureSize: '512x512',
          seamless: true,
          materialType: 'diffuse',
        });

        expect(result).toBeDefined();
        
        const parsed = JSON.parse(result);
        expect(parsed.operation).toBe('texture_generation');
        expect(parsed.savedPaths).toContain(outputPath);
        
        validateGeneratedFile(outputPath);
        
        expect(parsed.texture_description).toBe('Simple checkerboard pattern');
        expect(parsed.seamless).toBe(true);
        expect(parsed.material_type).toBe('diffuse');
        
        console.log(`Texture test image saved to: ${outputPath}`);
        
      } finally {
        cleanUpTestFile(outputPath);
      }
    }, 180000); // 3 minute timeout for API calls
  });

  describe('Error Handling', () => {
    it('should handle invalid API keys gracefully', async () => {
      if (!shouldRunIntegrationTests || !process.env.OPENAI_API_KEY) {
        console.log('Skipping error handling integration test - NO_MOCK_PROVIDERS not set or OPENAI_API_KEY missing');
        return;
      }

      // Temporarily override the API key with an invalid one
      const originalKey = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = 'invalid-key';
      
      const outputPath = path.join(testAssetsDir, generateTestFileName('error_test'));
      
      try {
        await expect(openaiGenerateImage({
          prompt: 'test',
          outputPath,
        })).rejects.toThrow();
      } finally {
        // Restore original key
        process.env.OPENAI_API_KEY = originalKey;
        cleanUpTestFile(outputPath);
      }
    }, 180000); // 3 minute timeout for error cases
  });
});