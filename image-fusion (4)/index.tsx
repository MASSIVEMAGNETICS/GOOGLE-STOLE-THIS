import React, { useState, useCallback, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, GenerateContentResponse, Modality } from "@google/genai";

const App = () => {
    const [activeTab, setActiveTab] = useState<'blend' | 'swap'>('blend');
    
    // State for Image Blending
    const [images, setImages] = useState<(string | null)[]>([null, null]);
    const [blendMode, setBlendMode] = useState<string>('');
    const [prompt, setPrompt] = useState<string>('');
    const [selectedModel, setSelectedModel] = useState<string>('imagen-4.0-generate-001');
    const [aspectRatio, setAspectRatio] = useState<string>('1:1');
    
    // State for Face Reference
    const [faceRefImage, setFaceRefImage] = useState<string | null>(null);
    const [sceneImage, setSceneImage] = useState<string | null>(null);
    const [faceRefPrompt, setFaceRefPrompt] = useState<string>('');


    // General State
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [generatedImage, setGeneratedImage] = useState<string | null>(null);
    const [sessionGallery, setSessionGallery] = useState<string[]>([]);


    const ai = useMemo(() => new GoogleGenAI({ apiKey: process.env.API_KEY }), []);

    const BLEND_MODES = [
        { name: 'Fusion', description: 'Smoothly merges concepts and aesthetics into a cohesive whole.' },
        { name: 'Surreal Collage', description: 'Creates a dreamlike composition with artistic juxtapositions.' },
        { name: 'Painterly Blend', description: 'Reimagines inputs with classical brushwork and texture.' },
        { name: 'Photorealistic Composite', description: 'Seamlessly integrates elements into a single, believable photograph.' },
        { name: 'Graphic Mashup', description: 'Bold, pop-art style with sharp lines and vibrant colors.' },
    ];

    const GENERATION_MODELS = [
        { id: 'imagen-4.0-generate-001', name: 'Imagen 4' },
    ];

    const ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4'];

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                const newImages = [...images];
                newImages[index] = reader.result as string;
                setImages(newImages);
            };
            reader.readAsDataURL(file);
        }
    };
    
    const handleFaceRefUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setFaceRefImage(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };
    
    const handleSceneImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setSceneImage(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };
    
    const handleRemoveFaceRef = () => {
        setFaceRefImage(null);
    };

    const handleRemoveSceneImage = () => {
        setSceneImage(null);
    };

    const handleRemoveImage = (indexToRemove: number) => {
        const newImages = images.map((img, index) => index === indexToRemove ? null : img);
        setImages(newImages);
    };

    const handleAddImageSlot = () => {
        if (images.length < 5) {
            setImages([...images, null]);
        }
    };
    
    const handleReset = () => {
        setImages([null, null]);
        setBlendMode('');
        setPrompt('');
        setGeneratedImage(null);
        setError(null);
        setLoading(false);
        setFaceRefImage(null);
        setSceneImage(null);
        setFaceRefPrompt('');
        setAspectRatio('1:1');
    };
    
    const handleSaveToSession = () => {
        if (generatedImage && !sessionGallery.includes(generatedImage)) {
            setSessionGallery([generatedImage, ...sessionGallery]);
        }
    };

    const handleGenerate = async () => {
        const validImages = images.filter(img => img) as string[];
        if (validImages.length < 2 || !blendMode) {
            setError('Please upload at least two images and select a blend style.');
            return;
        }

        setLoading(true);
        setError(null);
        setGeneratedImage(null);

        try {
            const visionPrompt = `You are an expert art director. Your task is to create a detailed, vivid, and descriptive prompt for an AI image generator. The prompt should combine the elements of the ${validImages.length} provided images in a style described as '${blendMode}'. Also incorporate the user's guidance: '${prompt || 'Create a visually stunning masterpiece.'}'. Generate only the descriptive prompt for the image generator and nothing else. Be creative and concise.`;
            
            const imageParts = validImages.map(img => ({
                inlineData: { mimeType: img.split(';')[0].split(':')[1], data: img.split(',')[1] }
            }));

            const visionResponse: GenerateContentResponse = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: { parts: [{ text: visionPrompt }, ...imageParts] },
            });
            
            const descriptivePrompt = visionResponse.text;
            if (!descriptivePrompt) {
                throw new Error('Could not generate a descriptive prompt.');
            }

            const imageResponse = await ai.models.generateImages({
                model: selectedModel,
                prompt: descriptivePrompt,
                config: {
                    numberOfImages: 1,
                    outputMimeType: 'image/jpeg',
                    aspectRatio: aspectRatio as "1:1" | "3:4" | "4:3" | "9:16" | "16:9",
                },
            });
            
            const base64ImageBytes = imageResponse.generatedImages[0]?.image?.imageBytes;

            if (base64ImageBytes) {
                setGeneratedImage(`data:image/jpeg;base64,${base64ImageBytes}`);
            } else {
                throw new Error('Image generation failed. The response did not contain image data.');
            }

        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : 'An unknown error occurred during image generation.');
        } finally {
            setLoading(false);
        }
    };

    const handleGenerateFaceRef = async () => {
        if (!faceRefImage || !sceneImage) {
            setError('Please upload both a face reference and a scene image.');
            return;
        }

        setLoading(true);
        setError(null);
        setGeneratedImage(null);

        try {
            const scenePart = {
                inlineData: {
                    mimeType: sceneImage.split(';')[0].split(':')[1],
                    data: sceneImage.split(',')[1]
                }
            };

            const faceRefPart = {
                inlineData: {
                    mimeType: faceRefImage.split(';')[0].split(':')[1],
                    data: faceRefImage.split(',')[1]
                }
            };
            
            const textPart = {
                text: `The first image is the scene. The second image contains the face to use as a reference. Modify the scene to replace a face with the reference face. Also incorporate this user guidance: "${faceRefPrompt || 'Blend them seamlessly and realistically.'}"`
            };

            const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash-image-preview',
              contents: {
                parts: [scenePart, faceRefPart, textPart],
              },
              config: {
                  responseModalities: [Modality.IMAGE, Modality.TEXT],
              },
            });

            let foundImage = false;
            const parts = response.candidates?.[0]?.content?.parts;
            if (parts) {
                for (const part of parts) {
                    if (part.inlineData) {
                        const base64ImageBytes = part.inlineData.data;
                        const mimeType = part.inlineData.mimeType;
                        setGeneratedImage(`data:${mimeType};base64,${base64ImageBytes}`);
                        foundImage = true;
                        break; 
                    }
                }
            }
            
            if (!foundImage) {
                 throw new Error('Image generation failed. The response did not contain image data.');
            }

        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : 'An unknown error occurred during image generation.');
        } finally {
            setLoading(false);
        }
    };
    
    const isFormComplete = images.filter(img => img).length >= 2 && blendMode;

    const styles: { [key: string]: React.CSSProperties } = {
        main: {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '2rem',
            gap: '2rem',
        },
        header: {
            textAlign: 'center',
            marginBottom: '1rem',
        },
        title: {
            fontFamily: "'Teko', sans-serif",
            fontSize: '4rem',
            color: 'var(--primary-color)',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
        },
        subtitle: {
            color: 'var(--on-surface-color)',
            fontSize: '1rem',
            marginTop: '-0.5rem',
        },
        container: {
            display: 'grid',
            gap: '2rem',
            width: '100%',
            maxWidth: '1200px',
        },
        controls: {
            background: 'var(--surface-color)',
            padding: '2rem',
            borderRadius: '12px',
            border: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5rem',
        },
        tabsContainer: {
            display: 'flex',
            borderBottom: '1px solid var(--border-color)',
            marginBottom: '1rem',
        },
        tabButton: {
            padding: '0.75rem 1.5rem',
            background: 'none',
            border: 'none',
            color: 'var(--on-surface-color)',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: 500,
            borderBottom: '3px solid transparent',
            transition: 'border-color 0.3s, color 0.3s',
        },
        tabButtonActive: {
            color: 'var(--primary-color)',
            borderBottom: '3px solid var(--primary-color)',
        },
        imageUploads: {
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
            gap: '1rem',
        },
