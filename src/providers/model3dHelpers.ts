import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import path from 'path';
import {
  AVAILABLE_VARIANTS,
  DEFAULT_VARIANTS,
  hunyuan3DGenerateMulti,
  hunyuan3DGenerateMultiTurbo,
  hunyuan3DGenerateSingle,
  hunyuan3DGenerateSingleTurbo,
  hunyuanWorldGenerate3D,
  Model3DFormat,
  type Model3DGenerationOptions,
  type Model3DGenerationResult,
  Model3DModel,
  Model3DVariant,
  trellisGenerate3DMulti,
  trellisGenerate3DSingle,
} from '../utils/model3dUtils.js';
import { generateImage } from './imageHelpers.js';

// Re-export enums for use in other modules
export {
  AVAILABLE_VARIANTS,
  DEFAULT_VARIANTS, Model3DFormat, Model3DModel,
  Model3DVariant
};

// Status file interface for background processing
export interface Model3DGenerationStatus {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number; // 0-100
  message: string;
  startTime: string;
  endTime?: string;
  result?: Model3DGenerationResult;
  error?: string;
  logs: string[];
}

// Create and update status file
export const updateStatusFile = (statusPath: string, status: Partial<Model3DGenerationStatus>) => {
  try {
    let currentStatus: Model3DGenerationStatus;

    if (existsSync(statusPath)) {
      const data = readFileSync(statusPath, 'utf8');
      currentStatus = JSON.parse(data);
    } else {
      currentStatus = {
        id: path.basename(statusPath, '.json'),
        status: 'pending',
        progress: 0,
        message: 'Initializing...',
        startTime: new Date().toISOString(),
        logs: []
      };
    }

    // Update with new status
    Object.assign(currentStatus, status);

    writeFileSync(statusPath, JSON.stringify(currentStatus, null, 2));
  } catch (error) {
    console.warn(`Failed to update status file ${statusPath}:`, error);
  }
};

// Add log entry to status file
export const addLogToStatus = (statusPath: string, message: string) => {
  try {
    let currentStatus: Model3DGenerationStatus;

    if (existsSync(statusPath)) {
      const data = readFileSync(statusPath, 'utf8');
      currentStatus = JSON.parse(data);
    } else {
      currentStatus = {
        id: path.basename(statusPath, '.json'),
        status: 'processing',
        progress: 0,
        message: 'Starting...',
        startTime: new Date().toISOString(),
        logs: []
      };
    }

    currentStatus.logs.push(`[${new Date().toISOString()}] ${message}`);
    writeFileSync(statusPath, JSON.stringify(currentStatus, null, 2));
  } catch (error) {
    console.warn(`Failed to add log to status file ${statusPath}:`, error);
  }
};

// Enhanced 3D generation options with automatic reference image support
export interface Model3DGenerationOptionsExtended extends Model3DGenerationOptions {
  autoGenerateReferences?: boolean;
  referenceModel?: 'ppqai';
  referenceViews?: ('front' | 'back' | 'top' | 'left' | 'right')[];
  cleanupReferences?: boolean;
}

// Helper function to generate reference images for 3D modeling with consistency
export const generateReferenceImages = async (
  prompt: string,
  outputBasePath: string,
  views: ('front' | 'back' | 'top' | 'left' | 'right')[] = ['front', 'back', 'top'],
  model: string = 'gpt-image-1.5'
): Promise<string[]> => {
  const referencePaths: string[] = [];

  // Sort views to ensure front is generated first for consistency
  const sortedViews = [...views].sort((a, b) => {
    if (a === 'front') return -1;
    if (b === 'front') return 1;
    return 0;
  });

  for (let i = 0; i < sortedViews.length; i++) {
    const view = sortedViews[i];
    const outputPath = outputBasePath.replace(/\.[^.]+$/, `_ref_${view}.png`);

    try {
      let result;

      if (i === 0) {
        // First view: generate from text prompt
        let viewPrompt = `${prompt}, ${view} view, `;
        viewPrompt += 'sharp technical reference image, clean white background, ';
        viewPrompt += 'professional 3D modeling reference, consistent lighting, ';
        viewPrompt += 'highly detailed, crisp details, sharp focus, ';
        viewPrompt += 'shot on Sony A7R IV with 85mm f/1.4 lens, ';
        viewPrompt += 'professional product photography, suitable for 3D reconstruction';

        switch (view) {
          case 'front':
            viewPrompt += ', front-facing view showing main features and proportions, sharp edges, fine details';
            break;
          case 'back':
            viewPrompt += ', rear view showing back details and construction, sharp edges, fine details';
            break;
          case 'top':
            viewPrompt += ', overhead view showing top layout and proportions, sharp edges, fine details';
            break;
          case 'left':
            viewPrompt += ', left side profile showing side details and proportions, sharp edges, fine details';
            break;
          case 'right':
            viewPrompt += ', right side profile showing opposite side details, sharp edges, fine details';
            break;
        }

        result = await generateImage({
          prompt: viewPrompt,
          outputPath,
          model: model,
          size: '1024x1024',
        });
      } else {
        // Subsequent views: use previous image(s) as input for consistency
        const inputImagePaths = referencePaths.slice(); // Use all previously generated images

        let viewPrompt = `Create a ${view} view of the same object, maintaining exact consistency `;
        viewPrompt += 'with the provided image(s). Sharp technical reference image, clean white background, ';
        viewPrompt += 'professional 3D modeling reference, consistent lighting, ';
        viewPrompt += 'highly detailed, crisp details, sharp focus, ';
        viewPrompt += 'shot on Sony A7R IV with 85mm f/1.4 lens, ';
        viewPrompt += 'professional product photography, suitable for 3D reconstruction';

        switch (view) {
          case 'front':
            viewPrompt += ', front-facing view showing main features and proportions, sharp edges, fine details';
            break;
          case 'back':
            viewPrompt += ', rear view showing back details and construction, sharp edges, fine details';
            break;
          case 'top':
            viewPrompt += ', overhead view showing top layout and proportions, sharp edges, fine details';
            break;
          case 'left':
            viewPrompt += ', left side profile showing side details and proportions, sharp edges, fine details';
            break;
          case 'right':
            viewPrompt += ', right side profile showing opposite side details, sharp edges, fine details';
            break;
        }

        result = await generateImage({
          prompt: viewPrompt,
          outputPath,
          inputImagePaths: inputImagePaths,
          model: model,
          size: '1024x1024',
        });
      }

      const parsedResult = JSON.parse(result);
      if (parsedResult.savedPaths && parsedResult.savedPaths.length > 0) {
        referencePaths.push(...parsedResult.savedPaths);
      }
    } catch (error) {
      console.warn(`Failed to generate ${view} reference image:`, error);
      // Continue with other views even if one fails
    }
  }

  return referencePaths;
};

// Helper function to determine which model variant to use
export const selectModelVariant = (
  model: Model3DModel,
  inputImageCount: number,
  preferTurbo: boolean = false
): Model3DVariant => {
  if (model === Model3DModel.TRELLIS) {
    return inputImageCount <= 1 ? Model3DVariant.SINGLE : Model3DVariant.MULTI;
  } else if (model === Model3DModel.HUNYUAN_WORLD) {
    // Hunyuan World only supports single image
    return Model3DVariant.SINGLE;
  } else {
    // Hunyuan3D variants
    if (preferTurbo) {
      return inputImageCount <= 1 ? Model3DVariant.SINGLE_TURBO : Model3DVariant.MULTI_TURBO;
    } else {
      return inputImageCount <= 1 ? Model3DVariant.SINGLE : Model3DVariant.MULTI;
    }
  }
};

// Helper function to validate and get default variant
export const validateAndGetVariant = (
  model: Model3DModel,
  variant?: Model3DVariant
): Model3DVariant => {
  if (!variant) {
    return DEFAULT_VARIANTS[model];
  }

  const availableVariants = AVAILABLE_VARIANTS[model];
  if (!availableVariants.includes(variant as any)) {
    console.warn(`Variant ${variant} not available for model ${model}. Using default: ${DEFAULT_VARIANTS[model]}`);
    return DEFAULT_VARIANTS[model];
  }

  return variant;
};

// Main 3D model generation function with automatic reference handling
export const generate3DModel = async (
  options: Model3DGenerationOptionsExtended
): Promise<Model3DGenerationResult> => {
  const {
    prompt,
    inputImagePaths = [],
    outputPath,
    model,
    variant,
    format = 'glb',
    autoGenerateReferences = true,
    referenceModel = 'ppqai',
    referenceViews = ['front', 'back', 'top'],
    cleanupReferences = true,
  } = options;

  let finalInputPaths = [...inputImagePaths];
  let generatedReferences: string[] = [];

  try {
    // If no input images provided, generate reference images automatically
    if (finalInputPaths.length === 0 && prompt && autoGenerateReferences) {
      console.log('No input images provided, generating reference images automatically...');

      const outputBasePath = outputPath.replace(/\.[^.]+$/, '');
      generatedReferences = await generateReferenceImages(
        prompt,
        outputBasePath,
        (variant && variant.includes('multi')) ? referenceViews : ['front'],
        'gpt-image-1.5'
      );

      finalInputPaths = generatedReferences;

      if (generatedReferences.length === 0) {
        throw new Error('Failed to generate reference images automatically');
      }
    }

    // Validate that we have input images
    if (finalInputPaths.length === 0) {
      throw new Error('At least one input image is required for 3D model generation');
    }

    // Determine the actual variant to use based on input count
    const actualVariant = variant || selectModelVariant(model, finalInputPaths.length);

    // Call the appropriate 3D generation function
    let result: Model3DGenerationResult;

    switch (model) {
      case 'trellis':
        if (actualVariant === 'single') {
          result = await trellisGenerate3DSingle({
            prompt,
            imagePath: finalInputPaths[0],
            outputPath,
            format,
          });
        } else {
          result = await trellisGenerate3DMulti({
            prompt,
            imagePaths: finalInputPaths,
            outputPath,
            format,
          });
        }
        break;

      case 'hunyuan3d':
        switch (actualVariant) {
          case 'single':
            result = await hunyuan3DGenerateSingle({
              prompt,
              imagePath: finalInputPaths[0],
              outputPath,
              format,
            });
            break;
          case 'multi':
            result = await hunyuan3DGenerateMulti({
              prompt,
              imagePaths: finalInputPaths,
              outputPath,
              format,
            });
            break;
          case 'single-turbo':
            result = await hunyuan3DGenerateSingleTurbo({
              prompt,
              imagePath: finalInputPaths[0],
              outputPath,
              format,
            });
            break;
          case 'multi-turbo':
            result = await hunyuan3DGenerateMultiTurbo({
              prompt,
              imagePaths: finalInputPaths,
              outputPath,
              format,
            });
            break;
          default:
            throw new Error(`Unsupported Hunyuan3D variant: ${actualVariant}`);
        }
        break;

      case 'hunyuan-world':
        // Hunyuan World only supports single image input
        result = await hunyuanWorldGenerate3D({
          prompt,
          imagePath: finalInputPaths[0],
          outputPath,
          format,
        });
        break;

      default:
        throw new Error(`Unsupported 3D model: ${model}`);
    }

    // Add metadata about automatic reference generation
    if (generatedReferences.length > 0) {
      result.auto_generated_references = generatedReferences;
      result.reference_model_used = referenceModel;
      result.reference_views_generated = referenceViews;
    }

    return result;

  } finally {
    // Clean up generated reference images if requested
    if (cleanupReferences && generatedReferences.length > 0) {
      for (const refPath of generatedReferences) {
        try {
          unlinkSync(refPath);
        } catch (cleanupError) {
          // Ignore cleanup errors
          console.warn(`Failed to cleanup reference image ${refPath}:`, cleanupError);
        }
      }
    }
  }
};

// Async 3D model generation with status file for long-running operations
export const generate3DModelAsync = async (
  options: Model3DGenerationOptionsExtended,
  statusPath: string
): Promise<{ statusPath: string }> => {
  const {
    prompt,
    inputImagePaths = [],
    outputPath,
    model,
    variant,
    format = 'glb',
    autoGenerateReferences = true,
    referenceModel = 'ppqai',
    referenceViews = ['front', 'back', 'top'],
    cleanupReferences = true,
  } = options;

  // Initialize status file
  updateStatusFile(statusPath, {
    status: 'pending',
    progress: 0,
    message: 'Initializing 3D model generation...',
  });

  // Start processing in background
  (async () => {
    let finalInputPaths = [...inputImagePaths];
    let generatedReferences: string[] = [];

    try {
      updateStatusFile(statusPath, {
        status: 'processing',
        progress: 5,
        message: 'Validating options and preparing inputs...',
      });

      addLogToStatus(statusPath, `Starting 3D generation with model: ${model}, variant: ${variant}`);

      // Validate options
      validate3DModelOptions(options);

      updateStatusFile(statusPath, {
        progress: 10,
        message: 'Checking input images...',
      });

      // If no input images provided, generate reference images automatically
      if (finalInputPaths.length === 0 && prompt && autoGenerateReferences) {
        addLogToStatus(statusPath, 'No input images provided, generating reference images automatically...');

        updateStatusFile(statusPath, {
          progress: 20,
          message: 'Generating reference images...',
        });

        const outputBasePath = outputPath.replace(/\.[^.]+$/, '');
        generatedReferences = await generateReferenceImages(
          prompt,
          outputBasePath,
          (variant && variant.includes('multi')) ? referenceViews : ['front'],
          'gpt-image-1.5'
        );

        finalInputPaths = generatedReferences;
        addLogToStatus(statusPath, `Generated ${generatedReferences.length} reference images`);
      }

      updateStatusFile(statusPath, {
        progress: 30,
        message: 'Preparing 3D generation request...',
      });

      // Determine the actual variant to use based on input count
      const actualVariant = variant || selectModelVariant(model, finalInputPaths.length);

      addLogToStatus(statusPath, `Using variant: ${actualVariant} with ${finalInputPaths.length} input images`);

      // Call the appropriate 3D generation function
      let result: Model3DGenerationResult;

      updateStatusFile(statusPath, {
        progress: 40,
        message: `Calling ${model} ${actualVariant} API...`,
      });

      switch (model) {
        case 'trellis':
          if (actualVariant === 'single') {
            result = await trellisGenerate3DSingle({
              prompt,
              imagePath: finalInputPaths[0],
              outputPath,
              format,
            });
          } else {
            result = await trellisGenerate3DMulti({
              prompt,
              imagePaths: finalInputPaths,
              outputPath,
              format,
            });
          }
          break;

        case 'hunyuan3d':
          updateStatusFile(statusPath, {
            progress: 50,
            message: 'Processing with Hunyuan3D...',
          });

          switch (actualVariant) {
            case 'single':
              result = await hunyuan3DGenerateSingle({
                prompt,
                imagePath: finalInputPaths[0],
                outputPath,
                format,
              });
              break;
            case 'multi':
              result = await hunyuan3DGenerateMulti({
                prompt,
                imagePaths: finalInputPaths,
                outputPath,
                format,
              });
              break;
            case 'single-turbo':
              result = await hunyuan3DGenerateSingleTurbo({
                prompt,
                imagePath: finalInputPaths[0],
                outputPath,
                format,
              });
              break;
            case 'multi-turbo':
              result = await hunyuan3DGenerateMultiTurbo({
                prompt,
                imagePaths: finalInputPaths,
                outputPath,
                format,
              });
              break;
            default:
              throw new Error(`Unsupported Hunyuan3D variant: ${actualVariant}`);
          }
          break;

        case 'hunyuan-world':
          updateStatusFile(statusPath, {
            progress: 50,
            message: 'Processing with Hunyuan World...',
          });

          // Hunyuan World only supports single image input
          result = await hunyuanWorldGenerate3D({
            prompt,
            imagePath: finalInputPaths[0],
            outputPath,
            format,
          });
          break;

        default:
          throw new Error(`Unsupported 3D model: ${model}`);
      }

      updateStatusFile(statusPath, {
        progress: 90,
        message: 'Finalizing result...',
      });

      // Add metadata about automatic reference generation
      if (generatedReferences.length > 0) {
        result.auto_generated_references = generatedReferences;
        result.reference_model_used = referenceModel;
        result.reference_views_generated = referenceViews;
      }

      updateStatusFile(statusPath, {
        status: 'completed',
        progress: 100,
        message: '3D model generation completed successfully!',
        endTime: new Date().toISOString(),
        result,
      });

      addLogToStatus(statusPath, '3D model generation completed successfully');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      updateStatusFile(statusPath, {
        status: 'failed',
        progress: 0,
        message: `Generation failed: ${errorMessage}`,
        endTime: new Date().toISOString(),
        error: errorMessage,
      });

      addLogToStatus(statusPath, `ERROR: ${errorMessage}`);

    } finally {
      // Clean up generated reference images if requested
      if (cleanupReferences && generatedReferences.length > 0) {
        addLogToStatus(statusPath, 'Cleaning up reference images...');
        for (const refPath of generatedReferences) {
          try {
            unlinkSync(refPath);
            addLogToStatus(statusPath, `Cleaned up: ${refPath}`);
          } catch (cleanupError) {
            addLogToStatus(statusPath, `Failed to cleanup ${refPath}: ${cleanupError}`);
          }
        }
      }
    }
  })();

  // Immediately return the status file path
  return { statusPath };
};

// Validation function for 3D model generation options
export const validate3DModelOptions = (options: Model3DGenerationOptionsExtended): void => {
  if (!options.outputPath || options.outputPath.trim().length === 0) {
    throw new Error('Output path is required and cannot be empty');
  }

  if (!['trellis', 'hunyuan3d', 'hunyuan-world'].includes(options.model)) {
    throw new Error('Model must be one of: trellis, hunyuan3d, hunyuan-world');
  }

  if (options.variant && !['single', 'multi', 'single-turbo', 'multi-turbo'].includes(options.variant)) {
    throw new Error('Variant must be one of: single, multi, single-turbo, multi-turbo');
  }

  if (options.format && !['glb', 'gltf'].includes(options.format)) {
    throw new Error('Format must be one of: glb, gltf');
  }

  // Validate variant compatibility with model
  if (options.model === 'trellis' && options.variant?.includes('turbo')) {
    throw new Error('Trellis model does not support turbo variants');
  }

  if (options.model === 'hunyuan-world' && options.variant !== 'single') {
    throw new Error('Hunyuan World model only supports single variant');
  }

  // If no input images and no prompt, validation fails
  if ((!options.inputImagePaths || options.inputImagePaths.length === 0) && !options.prompt) {
    throw new Error('Either input images or a prompt is required for 3D model generation');
  }
};

// Get default options for 3D model generation
export const getDefault3DOptions = (model: Model3DModel): Partial<Model3DGenerationOptionsExtended> => {
  const baseDefaults = {
    format: Model3DFormat.GLB,
    autoGenerateReferences: true,
    referenceModel: 'ppqai' as const,
    referenceViews: ['front', 'back', 'top'] as ('front' | 'back' | 'top')[],
    cleanupReferences: true,
  };

  switch (model) {
    case Model3DModel.TRELLIS:
      return {
        ...baseDefaults,
        model: Model3DModel.TRELLIS,
        variant: Model3DVariant.MULTI, // Prefer multi for better quality
      };

    case Model3DModel.HUNYUAN3D:
      return {
        ...baseDefaults,
        model: Model3DModel.HUNYUAN3D,
        variant: Model3DVariant.MULTI, // Prefer multi for better quality
      };

    case Model3DModel.HUNYUAN_WORLD:
      return {
        ...baseDefaults,
        model: Model3DModel.HUNYUAN_WORLD,
        variant: Model3DVariant.SINGLE, // Only supports single
      };

    default:
      throw new Error(`No default options available for model: ${model}`);
  }
};

// Merge user options with defaults
export const merge3DWithDefaults = (options: Model3DGenerationOptionsExtended): Model3DGenerationOptionsExtended => {
  const defaults = getDefault3DOptions(options.model);
  return { ...defaults, ...options };
};

// Helper function to generate 3D model with smart defaults
export const generate3DModelSmart = async (
  prompt: string,
  outputPath: string,
  model: Model3DModel = Model3DModel.HUNYUAN3D,
  options: Partial<Model3DGenerationOptionsExtended> = {}
): Promise<Model3DGenerationResult> => {
  const fullOptions: Model3DGenerationOptionsExtended = merge3DWithDefaults({
    prompt,
    outputPath,
    model,
    variant: Model3DVariant.MULTI, // Ensure variant is always set
    ...options,
  });

  validate3DModelOptions(fullOptions);

  return await generate3DModel(fullOptions);
};