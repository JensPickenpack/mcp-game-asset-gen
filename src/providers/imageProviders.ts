import path from 'path';
import {
  downloadAndSaveImage,
  encodeImageToBase64,
  getPPQAIKey,
  makeHTTPRequest,
  saveBase64Image,
} from '../utils/imageUtils.js';

// Export helper functions from imageHelpers for external use
export {
  generateImage, generateMultipleImages, getDefaultOptions,
  mergeWithDefaults, validateImageOptions, type ImageGenerationOptions
} from './imageHelpers.js';

// PPQ.ai Image Generation (unified API with many models)
export const ppqaiGenerateImage = async (args: {
  prompt: string;
  outputPath: string;
  model?: "gpt-image-1.5";
  quality?: string;
  n?: number;
  size?: string;
  image_url?: string;
  inputImagePath?: string;
}): Promise<string> => {
  const apiKey = getPPQAIKey();

  // If inputImagePath is provided, convert to base64 data URI for image_url
  let imageUrl = args.image_url;
  if (!imageUrl && args.inputImagePath) {
    const imageBase64 = encodeImageToBase64(args.inputImagePath);
    imageUrl = `data:image/png;base64,${imageBase64}`;
  }

  // Use gpt-image-1.5 as the only currently enabled image model.
  let model = args.model || "gpt-image-1.5";

  const body: any = {
    model: model,
    prompt: args.prompt,
    n: args.n || 1,
  };

  if (args.quality) {
    body.quality = args.quality;
  }

  if (args.size) {
    body.size = args.size;
  }

  if (imageUrl) {
    body.image_url = imageUrl;
  }

  const headers = {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };

  const endpoint = "https://api.ppq.ai/v1/images/generations";

  const response = await makeHTTPRequest(endpoint, "POST", headers, body);

  if (response.error) {
    throw new Error(`PPQ.ai API error: ${response.error.message || JSON.stringify(response.error)}`);
  }

  // Save generated images
  const savedPaths: string[] = [];
  const images = response.data || [];

  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    let outputPath = args.outputPath;

    // If multiple images, add index to filename
    if (images.length > 1) {
      const ext = path.extname(outputPath) || '.png';
      const baseName = path.basename(outputPath, ext);
      const dir = path.dirname(outputPath);
      outputPath = path.join(dir, `${baseName}_${i + 1}${ext}`);
    }

    if (image.url) {
      await downloadAndSaveImage(image.url, outputPath);
      savedPaths.push(outputPath);
    } else if (image.b64_json) {
      saveBase64Image(image.b64_json, outputPath);
      savedPaths.push(outputPath);
    }
  }

  if (savedPaths.length === 0) {
    throw new Error("No image data received from PPQ.ai API");
  }

  return JSON.stringify({
    provider: "PPQ.ai",
    model: model,
    operation: imageUrl ? "image-to-image" : "generate",
    savedPaths: savedPaths,
    prompt_used: args.prompt,
    cost: response.cost,
    parameters: body
  });
};

// PPQ.ai Image-to-Image transformation (dedicated tool)
export const ppqaiTransformImage = async (args: {
  prompt: string;
  outputPath: string;
  model?: string;
  quality?: string;
  size?: string;
  image_url?: string;
  inputImagePath?: string;
}): Promise<string> => {
  throw new Error('ppqai-transform_image is temporarily disabled because no stable i2i model is currently enabled.');
};

// Character Sheet Generation Tool
export const generateCharacterSheet = async (args: {
  characterDescription: string;
  outputPath: string;
  referenceImagePaths?: string[];
  model?: string;
  style?: string;
  includeExpressions?: boolean;
  includePoses?: boolean;
}): Promise<string> => {
  const style = args.style || "detailed digital art";

  // Build comprehensive character sheet prompt
  let prompt = `Create a detailed character sheet for: ${args.characterDescription}. `;
  prompt += `Art style: ${style}. `;

  if (args.includeExpressions) {
    prompt += "Include multiple facial expressions (happy, sad, angry, surprised, neutral). ";
  }

  if (args.includePoses) {
    prompt += "Show the character from multiple angles (front view, side view, back view). ";
  }

  prompt += "Character sheet format with clean white background, professional reference sheet layout, ";
  prompt += "consistent character design, high quality digital artwork suitable for animation or game development.";

  if (args.referenceImagePaths && args.referenceImagePaths.length > 0) {
    prompt += " Base the character on the provided reference images, maintaining consistency with the visual style and features shown.";
  }

  try {
    const { generateImage } = await import('./imageHelpers.js');

    const result = await generateImage({
      prompt,
      outputPath: args.outputPath,
      inputImagePaths: args.referenceImagePaths,
      model: args.model || 'gpt-image-1.5',
    });

    const parsedResult = JSON.parse(result);

    return JSON.stringify({
      ...parsedResult,
      operation: "character_sheet_generation",
      character_description: args.characterDescription,
      style: style,
      features: {
        expressions: args.includeExpressions || false,
        poses: args.includePoses || false,
      },
      reference_images: args.referenceImagePaths || []
    });

  } catch (error) {
    throw new Error(`Character sheet generation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
};

// Character Variation Tool
export const generateCharacterVariation = async (args: {
  prompt: string;
  outputPath: string;
  referenceImagePaths: string[];
  model?: string;
}): Promise<string> => {

  if (!args.referenceImagePaths || args.referenceImagePaths.length === 0) {
    throw new Error("At least one reference image is required for character variation");
  }

  let prompt = args.prompt;
  prompt += " Maintain consistency with the character design from the reference images. ";
  prompt += "High quality digital artwork with consistent lighting and style.";

  try {
    const { generateImage } = await import('./imageHelpers.js');

    const result = await generateImage({
      prompt,
      outputPath: args.outputPath,
      inputImagePaths: args.referenceImagePaths,
      model: args.model || 'gpt-image-1.5',
    });

    const parsedResult = JSON.parse(result);

    return JSON.stringify({
      ...parsedResult,
      operation: "character_variation",
      variation_prompt: args.prompt,
      reference_images: args.referenceImagePaths
    });

  } catch (error) {
    throw new Error(`Character variation generation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
};

// Pixel Art Character Generation
export const generatePixelArtCharacter = async (args: {
  characterDescription: string;
  outputPath: string;
  pixelDimensions: "8x8" | "16x16" | "32x32" | "48x48" | "64x64" | "96x96";
  spriteSheet?: boolean;
  model?: string;
  colors?: number;
  transparentBackground?: boolean;
  backgroundColor?: 'white' | 'black' | 'auto';
}): Promise<string> => {
  const targetSize = parseInt(args.pixelDimensions.split('x')[0]);

  // Note: AI models may not generate accurate small pixel art directly
  // We generate at 256x256 in pixel art style, then would scale down post-processing
  const generationSize = 256; // Always generate larger first

  let prompt = `Pixel art character: ${args.characterDescription}. `;
  prompt += `Retro game pixel art style, limited color palette`;
  if (args.colors) {
    prompt += ` with ${args.colors} colors`;
  }
  prompt += `, clean pixels, no anti-aliasing, 8-bit/16-bit game style. `;

  // For transparent backgrounds, specify isolated character
  if (args.transparentBackground) {
    prompt += "Character isolated on solid background, clean edges, no background details, ";
  }

  if (args.spriteSheet) {
    prompt += "Generate as sprite sheet with multiple poses: idle, walking animation frames (4 frames), ";
    prompt += "facing front, back, left, right. Grid layout on single image. ";
  }

  prompt += `Target final size will be ${args.pixelDimensions} pixels. `;
  prompt += "Sharp pixel boundaries, retro gaming aesthetic, solid colors.";

  try {
    const { generateImage } = await import('./imageHelpers.js');

    const tempPath = args.outputPath.replace(/\.[^.]+$/, '_temp_256px.png');

    const result = await generateImage({
      prompt,
      outputPath: tempPath,
      model: args.model || 'gpt-image-1.5',
      transparentBackground: args.transparentBackground,
      backgroundColor: args.backgroundColor,
      transparencyTolerance: 20,
      transparencyBlur: 0,
    });

    const parsedResult = JSON.parse(result);

    let note = `Generated at ${generationSize}x${generationSize}px. Recommend scaling down to ${targetSize}x${targetSize}px and applying pixel-perfect scaling for final use.`;
    if (args.transparentBackground) {
      note += " Sprite has transparent background for game use.";
    }

    return JSON.stringify({
      ...parsedResult,
      operation: "pixel_art_generation",
      character_description: args.characterDescription,
      pixel_dimensions: args.pixelDimensions,
      target_size: targetSize,
      generation_size: generationSize,
      sprite_sheet: args.spriteSheet || false,
      colors: args.colors || "auto",
      transparent_background: args.transparentBackground || false,
      temp_path: tempPath,
      note: note
    });

  } catch (error) {
    throw new Error(`Pixel art generation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
};

// 3D Texture Generation  
export const generateTexture = async (args: {
  textureDescription: string;
  outputPath: string;
  textureSize?: "512x512" | "1024x1024" | "2048x2048";
  seamless?: boolean;
  model?: string;
  materialType?: "diffuse" | "normal" | "roughness" | "displacement";
  transparentBackground?: boolean;
  backgroundColor?: 'white' | 'black' | 'auto';
  transparencyTolerance?: number;
}): Promise<string> => {
  const textureSize = args.textureSize || "1024x1024";
  const materialType = args.materialType || "diffuse";

  let prompt = `${materialType} texture map: ${args.textureDescription}. `;
  prompt += `High quality ${textureSize} texture, `;

  if (args.seamless) {
    prompt += "seamless tileable pattern, repeating texture, no visible seams when tiled, ";
  }

  // For transparent backgrounds, modify the prompt for sprite/decal style textures
  if (args.transparentBackground) {
    prompt += "sprite/decal style, ";
    if (materialType === "diffuse") {
      prompt += "isolated object with transparent background, clean edges, no shadows, ";
    }
  }

  switch (materialType) {
    case "diffuse":
      if (args.transparentBackground) {
        prompt += "color/albedo map with alpha transparency, object isolated on solid background";
      } else {
        prompt += "color/albedo map, realistic material colors and details";
      }
      break;
    case "normal":
      prompt += "normal map, purple/blue surface detail information, height variation data";
      break;
    case "roughness":
      prompt += "roughness map, grayscale surface roughness information, white=rough, black=smooth";
      break;
    case "displacement":
      prompt += "displacement/height map, grayscale height information for 3D surface displacement";
      break;
  }

  prompt += `, professional game/3D development quality, uniform lighting`;
  if (!args.transparentBackground) {
    prompt += ", no shadows";
  }
  prompt += ".";

  try {
    const { generateImage } = await import('./imageHelpers.js');

    const result = await generateImage({
      prompt,
      outputPath: args.outputPath,
      model: args.model || 'gpt-image-1.5',
      transparentBackground: args.transparentBackground,
      backgroundColor: args.backgroundColor,
      transparencyTolerance: args.transparencyTolerance,
      transparencyBlur: 1,
    });

    const parsedResult = JSON.parse(result);

    let usageNote = "Ready for use in 3D engines (Unity, Unreal, Blender). Apply to materials as " + materialType + " map.";
    if (args.transparentBackground) {
      usageNote += " Texture has alpha transparency for sprites/decals.";
    }

    return JSON.stringify({
      ...parsedResult,
      operation: "texture_generation",
      texture_description: args.textureDescription,
      texture_size: textureSize,
      material_type: materialType,
      seamless: args.seamless || false,
      transparent_background: args.transparentBackground || false,
      usage_note: usageNote
    });

  } catch (error) {
    throw new Error(`Texture generation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
};

// 3D Object Sheet Generation
export const generateObjectSheet = async (args: {
  objectDescription: string;
  outputBasePath: string;
  viewpoints?: ("front" | "back" | "left" | "right" | "top" | "bottom" | "perspective")[];
  model?: string;
  style?: string;
}): Promise<string> => {
  const viewpoints = args.viewpoints || ["front", "back", "left", "right", "top", "perspective"];
  const style = args.style || "clean concept art";

  const results: any[] = [];
  const savedPaths: string[] = [];

  const { generateImage } = await import('./imageHelpers.js');

  for (const viewpoint of viewpoints) {
    const outputPath = args.outputBasePath.replace(/\.[^.]+$/, `_${viewpoint}.png`);

    let prompt = `${args.objectDescription}, ${viewpoint} view, `;
    prompt += `${style} style, technical reference sheet, `;
    prompt += `clean white background, object centered, `;

    switch (viewpoint) {
      case "front":
        prompt += "front-facing view, showing main features and details";
        break;
      case "back":
        prompt += "rear view, showing back details and construction";
        break;
      case "left":
        prompt += "left side profile view, showing side details and proportions";
        break;
      case "right":
        prompt += "right side profile view, showing opposite side details";
        break;
      case "top":
        prompt += "top-down view, showing overhead layout and proportions";
        break;
      case "bottom":
        prompt += "bottom-up view, showing underside construction";
        break;
      case "perspective":
        prompt += "3/4 perspective view, showing depth and three-dimensional form";
        break;
    }

    prompt += ". Consistent object design, professional 3D reference quality.";

    try {
      const result = await generateImage({
        prompt,
        outputPath,
        model: args.model || 'gpt-image-1.5',
      });

      const parsedResult = JSON.parse(result);
      results.push({
        viewpoint,
        result: parsedResult
      });
      savedPaths.push(outputPath);

    } catch (error) {
      console.warn(`Failed to generate ${viewpoint} view:`, error);
      results.push({
        viewpoint,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return JSON.stringify({
    operation: "object_sheet_generation",
    object_description: args.objectDescription,
    viewpoints_requested: viewpoints,
    viewpoints_generated: results.filter(r => !r.error).length,
    saved_paths: savedPaths,
    style: style,
    provider: "PPQ.ai",
    results: results,
    usage_note: "Use these reference images for 3D modeling. Import into Blender/Maya as reference planes."
  });
};