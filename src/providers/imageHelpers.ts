import {
  openaiGenerateImage,
  geminiGenerateImage,
  falaiGenerateImage,
  falaiEditImage,
} from './imageProviders.js';
import path from 'path';

// Unified image generation interface
export interface ImageGenerationOptions {
  prompt: string;
  outputPath: string;
  provider: 'openai' | 'gemini' | 'falai';
  inputImagePaths?: string[];
  // OpenAI specific options
  size?: '1024x1024' | '1792x1024' | '1024x1792';
  quality?: 'standard' | 'hd';
  style?: 'vivid' | 'natural';
  n?: number;
  // Gemini specific options
  model?: string;
  // FAL.ai specific options
  image_size?: 'square_hd' | 'square' | 'portrait_4_3' | 'portrait_16_9' | 'landscape_4_3' | 'landscape_16_9';
  num_inference_steps?: number;
  guidance_scale?: number;
  // Transparent background options
  transparentBackground?: boolean;
  backgroundColor?: 'white' | 'black' | 'auto';
  transparencyTolerance?: number; // 0-255, color variation tolerance
  transparencyBlur?: number; // Edge smoothing blur
}

// Helper function to generate images with any provider
export const generateImage = async (options: ImageGenerationOptions): Promise<string> => {
  const { provider, inputImagePaths, transparentBackground, ...providerOptions } = options;

  // If transparent background is requested, use the specialized function
  if (transparentBackground) {
    const { generateTransparentImage } = await import('../utils/imageUtils.js');
    
    // Handle the 'auto' backgroundColor by defaulting to 'white' for the generation function
    const generationBackgroundColor = options.backgroundColor === 'auto' ? 'white' : options.backgroundColor;
    
    return JSON.stringify({
      operation: 'transparent_image_generation',
      provider,
      savedPaths: [await generateTransparentImage(
        options.prompt,
        options.outputPath,
        provider,
        {
          backgroundColor: generationBackgroundColor,
          tolerance: options.transparencyTolerance,
          blur: options.transparencyBlur,
          size: options.size,
          quality: options.quality,
          style: options.style,
          image_size: options.image_size,
          num_inference_steps: options.num_inference_steps,
          guidance_scale: options.guidance_scale,
        }
      )],
      prompt_used: options.prompt,
      transparent_background: true,
      background_color: options.backgroundColor || 'white',
      tolerance: options.transparencyTolerance || 30,
      blur: options.transparencyBlur || 1,
    });
  }

  switch (provider) {
    case 'openai':
      return await openaiGenerateImage({
        prompt: options.prompt,
        outputPath: options.outputPath,
        inputImagePath: inputImagePaths?.[0], // OpenAI editing takes single image
        size: options.size,
        quality: options.quality,
        style: options.style,
        n: options.n,
      });

    case 'gemini':
      return await geminiGenerateImage({
        prompt: options.prompt,
        outputPath: options.outputPath,
        inputImagePaths: inputImagePaths,
        model: options.model,
      });

    case 'falai':
      if (inputImagePaths && inputImagePaths.length > 0) {
        // Use editing if input image provided
        return await falaiEditImage({
          prompt: options.prompt,
          inputImagePath: inputImagePaths[0], // FAL.ai edit takes single image
          outputPath: options.outputPath,
          image_size: options.image_size,
          num_inference_steps: options.num_inference_steps,
          guidance_scale: options.guidance_scale,
        });
      } else {
        return await falaiGenerateImage({
          prompt: options.prompt,
          outputPath: options.outputPath,
          image_size: options.image_size,
          num_inference_steps: options.num_inference_steps,
          guidance_scale: options.guidance_scale,
        });
      }

    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
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

// Helper function to generate images with multiple providers for comparison
export const generateImageComparison = async (
  options: Omit<ImageGenerationOptions, 'provider'> & {
    providers: ('openai' | 'gemini' | 'falai')[];
  }
): Promise<string> => {
  const { providers, outputPath, ...baseOptions } = options;
  const savedPaths: string[] = [];
  const results: any[] = [];

  for (const provider of providers) {
    try {
      // Generate unique output path for each provider
      const ext = path.extname(outputPath) || '.png';
      const baseName = path.basename(outputPath, ext);
      const dir = path.dirname(outputPath);
      const providerOutputPath = path.join(dir, `${baseName}_${provider}${ext}`);

      const result = await generateImage({
        ...baseOptions,
        provider,
        outputPath: providerOutputPath,
      });

      const parsedResult = JSON.parse(result);
      savedPaths.push(...parsedResult.savedPaths);
      results.push({
        provider,
        result: parsedResult,
      });

    } catch (error) {
      results.push({
        provider,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return JSON.stringify({
    operation: 'image_generation_comparison',
    providers_requested: providers,
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

  if (!['openai', 'gemini', 'falai'].includes(options.provider)) {
    throw new Error('Provider must be one of: openai, gemini, falai');
  }

  // Provider-specific validation
  switch (options.provider) {
    case 'openai':
      if (options.size && !['1024x1024', '1792x1024', '1024x1792'].includes(options.size)) {
        throw new Error('OpenAI size must be one of: 1024x1024, 1792x1024, 1024x1792');
      }
      if (options.quality && !['standard', 'hd'].includes(options.quality)) {
        throw new Error('OpenAI quality must be one of: standard, hd');
      }
      if (options.style && !['vivid', 'natural'].includes(options.style)) {
        throw new Error('OpenAI style must be one of: vivid, natural');
      }
      if (options.n && (options.n < 1 || options.n > 10)) {
        throw new Error('OpenAI n must be between 1 and 10');
      }
      break;

    case 'falai':
      if (options.image_size && !['square_hd', 'square', 'portrait_4_3', 'portrait_16_9', 'landscape_4_3', 'landscape_16_9'].includes(options.image_size)) {
        throw new Error('FAL.ai image_size must be one of: square_hd, square, portrait_4_3, portrait_16_9, landscape_4_3, landscape_16_9');
      }
      if (options.num_inference_steps && (options.num_inference_steps < 1 || options.num_inference_steps > 50)) {
        throw new Error('FAL.ai num_inference_steps must be between 1 and 50');
      }
      if (options.guidance_scale && (options.guidance_scale < 1 || options.guidance_scale > 20)) {
        throw new Error('FAL.ai guidance_scale must be between 1 and 20');
      }
      break;
  }
};

// Helper function to get default options for each provider
export const getDefaultOptions = (provider: 'openai' | 'gemini' | 'falai'): Partial<ImageGenerationOptions> => {
  switch (provider) {
    case 'openai':
      return {
        size: '1024x1024',
        quality: 'standard',
        style: 'vivid',
        n: 1,
      };

    case 'gemini':
      return {
        model: 'gemini-3-pro-image-preview',
      };
      // case 'gemini':
      //   return {
      //     model: 'gemini-2.5-flash-image',
      //   }; // Don't remove that line yet

    case 'falai':
      return {
        image_size: 'square_hd',
        num_inference_steps: 20,
        guidance_scale: 7.5,
      };

    default:
      throw new Error(`No default options available for provider: ${provider}`);
  }
};

// Helper function to merge user options with defaults
export const mergeWithDefaults = (options: ImageGenerationOptions): ImageGenerationOptions => {
  const defaults = getDefaultOptions(options.provider);
  return { ...defaults, ...options };
};