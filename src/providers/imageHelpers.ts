import path from 'path';
import {
  ppqaiGenerateImage,
} from './imageProviders.js';

// Unified image generation interface (ppq.ai only)
export interface ImageGenerationOptions {
  prompt: string;
  outputPath: string;
  inputImagePaths?: string[];
  // PPQ.ai model selection
  model?: string;
  quality?: string;
  n?: number;
  size?: string;
  // Transparent background options
  transparentBackground?: boolean;
  backgroundColor?: 'white' | 'black' | 'auto';
  transparencyTolerance?: number;
  transparencyBlur?: number;
}

// Helper function to generate images via PPQ.ai
export const generateImage = async (options: ImageGenerationOptions): Promise<string> => {
  const { inputImagePaths, transparentBackground, ...restOptions } = options;

  // If transparent background is requested, use the specialized function
  if (transparentBackground) {
    const { generateTransparentImage } = await import('../utils/imageUtils.js');

    const generationBackgroundColor = options.backgroundColor === 'auto' ? 'white' : options.backgroundColor;

    return JSON.stringify({
      operation: 'transparent_image_generation',
      provider: 'ppqai',
      savedPaths: [await generateTransparentImage(
        options.prompt,
        options.outputPath,
        'ppqai',
        {
          backgroundColor: generationBackgroundColor,
          tolerance: options.transparencyTolerance,
          blur: options.transparencyBlur,
          size: options.size,
          quality: options.quality,
          model: options.model,
          n: options.n,
        }
      )],
      prompt_used: options.prompt,
      transparent_background: true,
      background_color: options.backgroundColor || 'white',
      tolerance: options.transparencyTolerance || 30,
      blur: options.transparencyBlur || 1,
    });
  }

  return await ppqaiGenerateImage({
    prompt: options.prompt,
    outputPath: options.outputPath,
    model: (options.model as any) || 'nano-banana-pro',
    quality: options.quality,
    n: options.n,
    size: options.size,
    inputImagePath: inputImagePaths?.[0],
  });
};

// Helper function to generate multiple images with consistent naming
export const generateMultipleImages = async (
  options: ImageGenerationOptions & { count: number }
): Promise<string> => {
  const { count, outputPath, ...baseOptions } = options;
  const savedPaths: string[] = [];
  const results: any[] = [];

  for (let i = 0; i < count; i++) {
    try {
      // Generate unique output path for each image
      const ext = path.extname(outputPath) || '.png';
      const baseName = path.basename(outputPath, ext);
      const dir = path.dirname(outputPath);
      const uniqueOutputPath = path.join(dir, `${baseName}_${i + 1}${ext}`);

      const result = await generateImage({
        ...baseOptions,
        outputPath: uniqueOutputPath,
      });

      const parsedResult = JSON.parse(result);
      savedPaths.push(...parsedResult.savedPaths);
      results.push(parsedResult);

    } catch (error) {
      results.push({
        error: error instanceof Error ? error.message : String(error),
        index: i,
      });
    }
  }

  return JSON.stringify({
    operation: 'multiple_image_generation',
    total_requested: count,
    successfully_generated: results.filter(r => !r.error).length,
    saved_paths: savedPaths,
    results: results,
  });
};

// Helper function to generate images with multiple providers for comparison (kept for compatibility but uses ppqai only)
export const generateImageComparison = async (
  options: ImageGenerationOptions & {
    models?: string[];
  }
): Promise<string> => {
  const { models = ['nano-banana-pro', 'flux-2-pro'], outputPath, ...baseOptions } = options;
  const savedPaths: string[] = [];
  const results: any[] = [];

  for (const model of models) {
    try {
      const ext = path.extname(outputPath) || '.png';
      const baseName = path.basename(outputPath, ext);
      const dir = path.dirname(outputPath);
      const modelOutputPath = path.join(dir, `${baseName}_${model}${ext}`);

      const result = await generateImage({
        ...baseOptions,
        model,
        outputPath: modelOutputPath,
      });

      const parsedResult = JSON.parse(result);
      savedPaths.push(...parsedResult.savedPaths);
      results.push({
        model,
        result: parsedResult,
      });

    } catch (error) {
      results.push({
        model,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return JSON.stringify({
    operation: 'image_generation_comparison',
    models_requested: models,
    successfully_generated: results.filter(r => !r.error).length,
    saved_paths: savedPaths,
    results: results,
  });
};

// Helper function to validate image generation parameters
export const validateImageOptions = (options: ImageGenerationOptions): void => {
  if (!options.prompt || options.prompt.trim().length === 0) {
    throw new Error('Prompt is required and cannot be empty');
  }

  if (!options.outputPath || options.outputPath.trim().length === 0) {
    throw new Error('Output path is required and cannot be empty');
  }

  if (options.n && (options.n < 1 || options.n > 10)) {
    throw new Error('n must be between 1 and 10');
  }
};

// Helper function to get default options
export const getDefaultOptions = (): Partial<ImageGenerationOptions> => {
  return {
    model: 'nano-banana-pro',
    n: 1,
  };
};

// Helper function to merge user options with defaults
export const mergeWithDefaults = (options: ImageGenerationOptions): ImageGenerationOptions => {
  const defaults = getDefaultOptions();
  return { ...defaults, ...options };
};