import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  generateReferenceImages,
  getDefault3DOptions,
  merge3DWithDefaults,
  Model3DFormat,
  type Model3DGenerationOptionsExtended,
  Model3DModel,
  Model3DVariant,
  selectModelVariant,
  validate3DModelOptions,
} from '../src/providers/model3dHelpers.js';

vi.mock('../src/providers/imageHelpers.js', () => ({
  generateImage: vi.fn(),
}));

vi.mock('../src/utils/model3dUtils.js', () => ({
  trellisGenerate3DSingle: vi.fn(),
  trellisGenerate3DMulti: vi.fn(),
  hunyuan3DGenerateSingle: vi.fn(),
  hunyuan3DGenerateMulti: vi.fn(),
  hunyuan3DGenerateSingleTurbo: vi.fn(),
  hunyuan3DGenerateMultiTurbo: vi.fn(),
  validateBase64ImageURI: vi.fn(),
  convertPathsToBase64URIs: vi.fn(),
  Model3DModel: {
    TRELLIS: 'trellis',
    HUNYUAN3D: 'hunyuan3d',
  },
  Model3DVariant: {
    SINGLE: 'single',
    MULTI: 'multi',
    SINGLE_TURBO: 'single-turbo',
    MULTI_TURBO: 'multi-turbo',
  },
  Model3DFormat: {
    GLB: 'glb',
    GLTF: 'gltf',
  },
  AVAILABLE_VARIANTS: {
    trellis: ['single', 'multi'],
    hunyuan3d: ['single', 'multi', 'single-turbo', 'multi-turbo'],
  },
  DEFAULT_VARIANTS: {
    trellis: 'multi',
    hunyuan3d: 'multi',
  },
}));

import { generateImage } from '../src/providers/imageHelpers.js';
const mockGenerateImage = vi.mocked(generateImage);

describe('3D Model Helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validate3DModelOptions', () => {
    it('should pass validation for valid options', () => {
      const options: Model3DGenerationOptionsExtended = {
        outputPath: 'model.glb',
        model: Model3DModel.TRELLIS,
        variant: Model3DVariant.SINGLE,
        prompt: 'test model',
      };

      expect(() => validate3DModelOptions(options)).not.toThrow();
    });

    it('should throw error for missing output path', () => {
      const options: Model3DGenerationOptionsExtended = {
        outputPath: '',
        model: Model3DModel.TRELLIS,
      };

      expect(() => validate3DModelOptions(options)).toThrow('Output path is required and cannot be empty');
    });

    it('should throw error for invalid model', () => {
      const options: Model3DGenerationOptionsExtended = {
        outputPath: 'model.glb',
        model: 'invalid' as any,
      };

      expect(() => validate3DModelOptions(options)).toThrow('Model must be one of: trellis, hunyuan3d');
    });

    it('should throw error for invalid variant', () => {
      const options: Model3DGenerationOptionsExtended = {
        outputPath: 'model.glb',
        model: Model3DModel.TRELLIS,
        variant: 'invalid' as any,
      };

      expect(() => validate3DModelOptions(options)).toThrow('Variant must be one of: single, multi, single-turbo, multi-turbo');
    });

    it('should throw error for turbo variant with trellis', () => {
      const options: Model3DGenerationOptionsExtended = {
        outputPath: 'model.glb',
        model: Model3DModel.TRELLIS,
        variant: Model3DVariant.SINGLE_TURBO,
      };

      expect(() => validate3DModelOptions(options)).toThrow('Trellis model does not support turbo variants');
    });

    it('should throw error when no images or prompt provided', () => {
      const options: Model3DGenerationOptionsExtended = {
        outputPath: 'model.glb',
        model: Model3DModel.TRELLIS,
        inputImagePaths: [],
      };

      expect(() => validate3DModelOptions(options)).toThrow('Either input images or a prompt is required for 3D model generation');
    });
  });

  describe('getDefault3DOptions', () => {
    it('should return default options for Trellis', () => {
      const defaults = getDefault3DOptions(Model3DModel.TRELLIS);

      expect(defaults).toEqual({
        format: Model3DFormat.GLB,
        autoGenerateReferences: true,
        referenceModel: 'gemini',
        referenceViews: ['front', 'back', 'top'],
        cleanupReferences: true,
        model: Model3DModel.TRELLIS,
        variant: Model3DVariant.MULTI,
      });
    });

    it('should return default options for Hunyuan3D', () => {
      const defaults = getDefault3DOptions(Model3DModel.HUNYUAN3D);

      expect(defaults).toEqual({
        format: Model3DFormat.GLB,
        autoGenerateReferences: true,
        referenceModel: 'gemini',
        referenceViews: ['front', 'back', 'top'],
        cleanupReferences: true,
        model: Model3DModel.HUNYUAN3D,
        variant: Model3DVariant.MULTI,
      });
    });

    it('should throw error for invalid model', () => {
      expect(() => getDefault3DOptions('invalid' as any)).toThrow('No default options available for model: invalid');
    });
  });

  describe('merge3DWithDefaults', () => {
    it('should merge user options with defaults', () => {
      const userOptions: Model3DGenerationOptionsExtended = {
        outputPath: 'model.glb',
        model: Model3DModel.TRELLIS,
        variant: Model3DVariant.SINGLE,
        prompt: 'test model',
      };

      const merged = merge3DWithDefaults(userOptions);

      expect(merged).toEqual({
        format: Model3DFormat.GLB,
        autoGenerateReferences: true,
        referenceModel: 'gemini',
        referenceViews: ['front', 'back', 'top'],
        cleanupReferences: true,
        model: Model3DModel.TRELLIS,
        variant: Model3DVariant.SINGLE,
        outputPath: 'model.glb',
        prompt: 'test model',
      });
    });

    it('should preserve user options when not conflicting with defaults', () => {
      const userOptions: Model3DGenerationOptionsExtended = {
        outputPath: 'model.glb',
        model: Model3DModel.HUNYUAN3D,
        referenceViews: ['front', 'left'],
        prompt: 'test model',
      };

      const merged = merge3DWithDefaults(userOptions);

      expect(merged.referenceViews).toEqual(['front', 'left']);
      expect(merged.variant).toBe(Model3DVariant.MULTI);
    });
  });

  describe('selectModelVariant', () => {
    it('should select single variant for Trellis with one image', () => {
      const variant = selectModelVariant(Model3DModel.TRELLIS, 1);
      expect(variant).toBe(Model3DVariant.SINGLE);
    });

    it('should select multi variant for Trellis with multiple images', () => {
      const variant = selectModelVariant(Model3DModel.TRELLIS, 3);
      expect(variant).toBe(Model3DVariant.MULTI);
    });

    it('should select single variant for Hunyuan3D with one image', () => {
      const variant = selectModelVariant(Model3DModel.HUNYUAN3D, 1);
      expect(variant).toBe(Model3DVariant.SINGLE);
    });

    it('should select multi variant for Hunyuan3D with multiple images', () => {
      const variant = selectModelVariant(Model3DModel.HUNYUAN3D, 3);
      expect(variant).toBe(Model3DVariant.MULTI);
    });

    it('should select single-turbo for Hunyuan3D with turbo preference', () => {
      const variant = selectModelVariant(Model3DModel.HUNYUAN3D, 1, true);
      expect(variant).toBe(Model3DVariant.SINGLE_TURBO);
    });

    it('should select multi-turbo for Hunyuan3D with multiple images and turbo preference', () => {
      const variant = selectModelVariant(Model3DModel.HUNYUAN3D, 3, true);
      expect(variant).toBe(Model3DVariant.MULTI_TURBO);
    });
  });

  describe('generateReferenceImages', () => {
    it('should generate reference images for specified views', async () => {
      mockGenerateImage
        .mockResolvedValueOnce(JSON.stringify({ savedPaths: ['test_front.png'] }))
        .mockResolvedValueOnce(JSON.stringify({ savedPaths: ['test_back.png'] }))
        .mockResolvedValueOnce(JSON.stringify({ savedPaths: ['test_top.png'] }));

      const result = await generateReferenceImages(
        'test object',
        'test_object.png',
        ['front', 'back', 'top'],
        'gemini'
      );

      expect(mockGenerateImage).toHaveBeenCalledTimes(3);
      expect(mockGenerateImage).toHaveBeenCalledWith(expect.objectContaining({
        provider: 'gemini',
        prompt: expect.stringContaining('test object'),
      }));
      expect(result).toEqual(['test_front.png', 'test_back.png', 'test_top.png']);
    });

    it('should generate only front view for single image models', async () => {
      mockGenerateImage.mockResolvedValue(JSON.stringify({ savedPaths: ['test_front.png'] }));

      const result = await generateReferenceImages(
        'test object',
        'test_object.png',
        ['front'],
        'gemini'
      );

      expect(mockGenerateImage).toHaveBeenCalledTimes(1);
      expect(result).toEqual(['test_front.png']);
    });

    it('should handle generation failures gracefully', async () => {
      mockGenerateImage
        .mockResolvedValueOnce(JSON.stringify({ savedPaths: ['test_front.png'] }))
        .mockRejectedValueOnce(new Error('Generation failed'))
        .mockResolvedValueOnce(JSON.stringify({ savedPaths: ['test_top.png'] }));

      const result = await generateReferenceImages(
        'test object',
        'test_object.png',
        ['front', 'back', 'top'],
        'gemini'
      );

      expect(result).toEqual(['test_front.png', 'test_top.png']);
      expect(result).not.toContain('test_back.png');
    });

    it('should use different models for reference generation', async () => {
      mockGenerateImage.mockResolvedValue(JSON.stringify({ savedPaths: ['test.png'] }));

      await generateReferenceImages(
        'test object',
        'test_object.png',
        ['front'],
        'openai'
      );

      expect(mockGenerateImage).toHaveBeenCalledWith(expect.objectContaining({
        provider: 'openai',
        size: '1024x1024',
      }));
    });
  });
});