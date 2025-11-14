import { GoogleGenAI, Modality, Type } from "@google/genai";
import { type Language } from "./translations";
import { getProcessedStructure } from "./utils";
import { translations } from "./translations";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

export class RateLimitError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'RateLimitError';
    }
}

export interface NarrativeConcept {
    coreTheme: string;
    story: string;
    keyEmotions: string;
    imagery: string;
}

/**
 * A centralized error handler for all Gemini API calls.
 * It parses the error and returns a user-friendly, translated message.
 * @param error The unknown error object from a catch block.
 * @param language The current language for translation.
 * @returns An Error object with a user-friendly message.
 */
const handleGeminiError = (error: unknown, language: Language): Error => {
    const t = translations[language].ui;
    let displayMessage = t.errorUnknown;
    let isRateLimitError = false;

    console.error("Gemini API Error:", error);

    if (error instanceof Error) {
        const errorMessage = error.message;
        const lowerErrorMessage = errorMessage.toLowerCase();

        if (lowerErrorMessage.includes('api key not valid') || lowerErrorMessage.includes('api key') || lowerErrorMessage.includes('apikey')) {
            displayMessage = t.apiKeyInvalidError;
        } else if (lowerErrorMessage.includes('model is overloaded')) {
            displayMessage = t.errorModelOverloaded;
        } else if (lowerErrorMessage.includes('network') || lowerErrorMessage.includes('fetch') || lowerErrorMessage.includes('xhr') || lowerErrorMessage.includes('rpc')) {
            displayMessage = t.errorNetwork;
        } else if (lowerErrorMessage.includes('resource_exhausted') || lowerErrorMessage.includes('quota') || lowerErrorMessage.includes('429')) {
            displayMessage = t.errorRateLimit;
            isRateLimitError = true;
        } else {
             // If no simple match, try to parse as JSON for more details
            try {
                const jsonStart = errorMessage.indexOf('{');
                if (jsonStart !== -1) {
                    const jsonString = errorMessage.substring(jsonStart);
                    const parsedError = JSON.parse(jsonString);
                    const nestedError = parsedError.error || parsedError;

                    if (nestedError.status === 'RESOURCE_EXHAUSTED') {
                        displayMessage = t.errorRateLimit;
                        isRateLimitError = true;
                    } else if (nestedError.message) {
                        displayMessage = nestedError.message;
                    } else {
                        displayMessage = errorMessage;
                    }
                } else {
                     displayMessage = errorMessage;
                }
            } catch (e) {
                displayMessage = errorMessage;
            }
        }
    }
    
    if (isRateLimitError) {
        return new RateLimitError(displayMessage);
    }
    return new Error(displayMessage);
};


const translateTagsToEnglish = async (tags: string[], language: Language): Promise<string[]> => {
    if (tags.length === 0) {
        return [];
    }
    if (language === 'en') {
        return tags;
    }
    
    const languageMap = {
        th: 'Thai',
        zh: 'Chinese',
        ja: 'Japanese',
        ko: 'Korean',
        en: 'English'
    };
    const sourceLanguage = languageMap[language];

    const prompt = `Translate the following music style tags from ${sourceLanguage} to English. Provide the closest, most common English equivalent for each tag. For culturally specific genres (like 'ลูกทุ่ง'), transliterate them phonetically (e.g., 'Luk Thung'). Return ONLY a comma-separated list of the translated English terms, with no extra text or explanations.
Tags: ${tags.join(', ')}`;
    
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash', 
            contents: prompt,
            config: { temperature: 0 }
        });

        const translatedText = response.text;
        if (translatedText) {
            return translatedText.split(',').map(tag => tag.trim()).filter(Boolean);
        }
        return tags; 
    } catch (error) {
        console.error("Tag translation failed:", error);
        return tags;
    }
};

const translateTextToEnglish = async (text: string, language: Language): Promise<string> => {
    if (!text || language === 'en') {
        return text;
    }

    const languageMap: { [key in Language]?: string } = { th: 'Thai', zh: 'Chinese', ja: 'Japanese', ko: 'Korean' };
    const sourceLanguage = languageMap[language];
    if (!sourceLanguage) return text;

    const prompt = `Translate the following text from ${sourceLanguage} to English. Return ONLY the translated English text, with no extra formatting, labels, or explanations.\n\nText: "${text}"`;
    
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: { temperature: 0 }
        });
        
        const translatedText = response.text.trim();
        return translatedText || text; // Fallback to original text if translation is empty
    } catch (error) {
        console.error("Text translation failed:", error);
        return text; // Fallback to original text on error
    }
};


export interface GenerateSongParams {
  userPrompt: string;
  vocalGender: string;
  instruments: string[];
  genres: string[];
  moods: string[];
  tempos: string[];
  inspiredBySong?: string;
  inspiredByArtist?: string;
  maleRole?: string;
  femaleRole?: string;
  songStructure?: string[];
  sunoAiMode: 'auto' | 'manual';
  weirdness: number;
  styleInfluence: number;
  model: string;
  language: Language;
}

export interface GenerateAlbumArtParams {
  prompt: string;
  noText?: boolean;
}

interface SpeechInputs {
    selectedVocal: string;
}

const getMasterPrompt = (params: Omit<GenerateSongParams, 'model' | 'genres' | 'moods' | 'tempos'>, style: string): string => {
  const { userPrompt, vocalGender, instruments, inspiredBySong, inspiredByArtist, maleRole, femaleRole, songStructure, sunoAiMode, weirdness, styleInfluence, language } = params;
  const p = translations[language].prompts;
  const t = translations[language];

  // 1. Build dynamic instruction blocks
  const isRap = style.toLowerCase().includes('rap') || style.toLowerCase().includes('hip-hop');
  const rapInstruction = isRap ? p.rap_guidelines_title + p.rap_guidelines_content : '';
  
  const isLukThung = style.toLowerCase().includes('ลูกทุ่ง') || style.toLowerCase().includes('หมอลำ') || style.toLowerCase().includes('luk thung') || style.toLowerCase().includes('mor lam');
  const lukThungInstruction = isLukThung ? p.lukthung_guidelines_title + p.lukthung_guidelines_content : '';

  const autoParamInstruction = sunoAiMode === 'auto' ? p.suno_auto_rules_title + p.suno_auto_rules_content : '';

  let instrumentInstruction = '';
  let instrumentLyricConstraint = '';
  if (instruments.length > 0) {
    const instrumentList = instruments.join(', ');
    instrumentInstruction = p.instrument_focus_title + p.instrument_focus_content.replace('{instrumentList}', instrumentList);
    instrumentLyricConstraint = p.instrument_lyric_constraint.replace('{instrumentList}', instrumentList);
  }

  // The duet option is always the third item in the VOCALS array for all languages.
  const isDuet = vocalGender === t.options.VOCALS[2];
  const duetInstruction = isDuet 
    ? p.duet_instructions_title + p.duet_instructions_content
        .replace('{maleRole}', maleRole || p.duet_default_male)
        .replace('{femaleRole}', femaleRole || p.duet_default_female)
    : '';
  
  let inspirationInstruction = '';
  if (inspiredBySong || inspiredByArtist) {
    inspirationInstruction += `\n\n${p.inspiration_guidelines_title}\n`;
    if (inspiredBySong) inspirationInstruction += p.inspiration_song.replace('{song}', inspiredBySong) + '\n';
    if (inspiredByArtist) inspirationInstruction += p.inspiration_artist.replace('{artist}', inspiredByArtist) + '\n';
  }

  const structureRule = (songStructure && songStructure.length > 0)
    ? p.structure_rule_title + p.structure_rule_content.replace('{structure}', songStructure.join(' -> '))
    : '';

  // 2. Build the structure body
  const getStructurePlaceholder = (part: string) => {
      const lowerPart = part.toLowerCase();
      const instrumentalKeywords = t.options.instrumental_keywords;
      const isInstrumental = instrumentalKeywords.some(keyword => lowerPart.includes(keyword));

      if (isInstrumental) {
          if (lowerPart.includes('intro') || lowerPart.includes(t.options.instrumental_keywords[0])) return p.placeholder_intro; // Assumes 'intro' is the first keyword
          if (lowerPart.includes('solo') || lowerPart.includes(t.options.instrumental_keywords[1])) return p.placeholder_solo; // Assumes 'solo' is the second
          if (lowerPart.includes('outro') || lowerPart.includes(t.options.instrumental_keywords[2])) return p.placeholder_outro; // Assumes 'outro' is the third
          return p.placeholder_instrumental;
      }
      return p.placeholder_lyrics;
  };
  
  const structureBody = (() => {
      if (!songStructure || songStructure.length === 0) {
          return p.default_structure
            .replace(/{placeholder_intro}/g, getStructurePlaceholder('[Intro]'))
            .replace(/{placeholder_solo}/g, getStructurePlaceholder('[Solo]'))
            .replace(/{placeholder_outro}/g, getStructurePlaceholder('[Outro]'));
      }
      const processedParts = getProcessedStructure(songStructure);
      return processedParts.map(part => `${part}\n${getStructurePlaceholder(part)}`).join('\n\n');
  })();

  // 3. Build Suno parameter lines
  const weirdnessLine = sunoAiMode === 'manual'
    ? `${p.weirdnessLabel} ${weirdness}`
    : `${p.weirdnessLabel} ${p.suno_auto_weirdness_placeholder}`;
  const styleInfluenceLine = sunoAiMode === 'manual'
    ? `${p.styleInfluenceLabel} ${styleInfluence}`
    : `${p.styleInfluenceLabel} ${p.suno_auto_style_influence_placeholder}`;

  // 4. Assemble the final master prompt
  return p.master_template
    .replace('{final_goal}', p.final_goal)
    .replace('{label_song_title}', p.label_song_title)
    .replace('{placeholder_song_title}', p.placeholder_song_title)
    .replace('{label_style}', p.label_style)
    .replace('{style}', style)
    .replace('{label_vocal_gender}', p.label_vocal_gender)
    .replace('{vocalGender}', vocalGender)
    .replace('{weirdnessLabel} {suno_auto_weirdness_placeholder}', weirdnessLine)
    .replace('{styleInfluenceLabel} {suno_auto_style_influence_placeholder}', styleInfluenceLine)
    .replace('{label_lyrics}', p.label_lyrics)
    .replace('{structureBody}', structureBody)
    .replace('{golden_rules_title}', p.golden_rules_title)
    .replace('{rule_emotional_core}', p.rule_emotional_core)
    .replace('{rule_narrative_flow}', p.rule_narrative_flow)
    .replace('{rule_lyrical_craft}', p.rule_lyrical_craft)
    .replace('{rule_authentic_voice}', p.rule_authentic_voice)
    .replace('{rule_language}', p.rule_language)
    .replace('{rule_rhythm}', p.rule_rhythm)
    .replace('{rule_repetition}', p.rule_repetition)
    .replace('{rule_description_language}', p.rule_description_language)
    .replace('{instrumentLyricConstraint}', instrumentLyricConstraint)
    .replace('{rapInstruction}', rapInstruction)
    .replace('{lukThungInstruction}', lukThungInstruction)
    .replace('{autoParamInstruction}', autoParamInstruction)
    .replace('{analysis_guide_title}', p.analysis_guide_title)
    .replace('{analysis_guide_content}', p.analysis_guide_content)
    .replace('{instrumentInstruction}', instrumentInstruction)
    .replace('{duetInstruction}', duetInstruction)
    .replace('{inspirationInstruction}', inspirationInstruction)
    .replace('{structureRule}', structureRule)
    .replace('{command_instruction}', p.command_instruction)
    .replace('{user_request_header}', p.user_request_header)
    .replace('{userPrompt}', userPrompt);
}

export const generateSong = async (params: GenerateSongParams): Promise<string> => {
  // Combine all style-related tags into one array for translation.
  // This ensures the final 'Style:' metadata line is in English for Suno AI compatibility,
  // even for culturally specific genres like 'ลูกทุ่ง'.
  const allTagsToTranslate = [
    ...params.genres,
    ...params.moods,
    ...params.tempos,
    ...params.instruments,
  ].filter(Boolean);
  
  // Translate all tags to English.
  const translatedTags = await translateTagsToEnglish(allTagsToTranslate, params.language);
  
  // The final style string is now entirely in English.
  const finalStyle = [...new Set(translatedTags)].join(', ');
  
  const fullPrompt = getMasterPrompt(params, finalStyle);

  try {
    const response = await ai.models.generateContent({
      model: params.model,
      contents: fullPrompt,
    });
    
    const songText = response.text;

    if (!songText) {
        const candidate = response.candidates?.[0];
        if (candidate?.finishReason === 'SAFETY') {
            const safetyMessage = "The response was blocked for safety reasons. This can happen if the prompt contains sensitive topics. Please adjust your prompt and try again.";
            console.warn("Safety ratings:", candidate.safetyRatings);
            throw new Error(safetyMessage);
        }
        
        if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
            throw new Error(`The AI model stopped generating for an unexpected reason: ${candidate.finishReason}. Please try your request again.`);
        }

        throw new Error("The AI model returned an empty response. This might be a temporary issue, please try again.");
    }
    
    return songText;

  } catch (error) {
    throw handleGeminiError(error, params.language);
  }
};


export const generateSpeech = async (songData: string, inputs: SpeechInputs, language: Language): Promise<string> => {
    const t = translations[language];
    // The duet option is always the third item in the VOCALS array.
    const isDuet = inputs.selectedVocal === t.options.VOCALS[2];

    // Extract only the lyrics part for TTS
    const lyricsLabels = Object.values(translations)
        .map(t => t.prompts.label_lyrics.slice(0, -1))
        .join('|');
    const lyricsHeaderRegex = new RegExp(`(${lyricsLabels}):`, 'm');
    const lyricsStartIndex = songData.search(lyricsHeaderRegex);
    
    let rawLyrics = '';
    if (lyricsStartIndex !== -1) {
        rawLyrics = songData.substring(lyricsStartIndex).replace(lyricsHeaderRegex, '').trim();
    } else {
        const firstSectionIndex = songData.search(/\[.*?\]/);
        if(firstSectionIndex !== -1) {
            rawLyrics = songData.substring(firstSectionIndex).trim();
        } else {
            throw new Error("No lyrics found in the song data to generate audio.");
        }
    }

    let prompt = '';
    let config: any;

    if (isDuet) {
        prompt = `Read the following song lyrics, which are a duet between a Male and a Female singer:\n\n${rawLyrics}`;
        config = {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                multiSpeakerVoiceConfig: {
                    speakerVoiceConfigs: [
                        {
                            speaker: 'Male',
                            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } }
                        },
                        {
                            speaker: 'Female',
                            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } }
                        }
                    ]
                }
            }
        };
    } else {
        // Male is the first option, female is the second.
        const isMale = inputs.selectedVocal === t.options.VOCALS[0];
        const voiceName = isMale ? 'Zephyr' : 'Puck';

        const duetMarkerRegex = /\((Male|Female|Duet)\):\s*/gi;
        prompt = rawLyrics.replace(duetMarkerRegex, '').trim();
        
        config = {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: { voiceName },
                },
            },
        };
    }

    if (!prompt.trim()) {
        throw new Error("No valid lyrics found to generate audio.");
    }
    
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text: prompt }] }],
            config,
        });
        
        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64Audio) {
            throw new Error("The AI model did not return any audio data.");
        }
        return base64Audio;
        
    } catch (error) {
        throw handleGeminiError(error, language);
    }
};

export const generateAlbumArt = async (params: GenerateAlbumArtParams, language: Language): Promise<string> => {
    const t = translations[language].ui;
    
    try {
        const englishPrompt = await translateTextToEnglish(params.prompt, language);

        let finalPrompt = englishPrompt;
        
        // Add instructions for realism and composition
        finalPrompt += `, professional album cover art, realistic photo, high detail, plausible composition that a human would create, avoids overcrowding too many elements into one image.`;
        
        // Re-enforce Thai nationality if needed.
        if (language === 'th') {
            finalPrompt += ` Human characters MUST be clearly identifiable as being of Thai nationality.`;
        }

        if (params.noText) {
            finalPrompt += ` (A purely visual image with no text, words, letters, or typography).`;
        }
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image', // Always use the free model
            contents: {
                parts: [{ text: finalPrompt }],
            },
            config: {
                responseModalities: [Modality.IMAGE],
            },
        });
        
        const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);

        if (imagePart?.inlineData) {
            return imagePart.inlineData.data;
        }
        
        const candidate = response.candidates?.[0];
        if (candidate?.finishReason === 'SAFETY') {
            const safetyMessage = "The album art could not be generated due to the prompt being blocked by safety filters. Please adjust the song's themes or imagery and try again.";
            console.warn("Safety ratings for image generation:", candidate.safetyRatings);
            throw new Error(safetyMessage);
        }
        
        if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
            throw new Error(`Image generation was interrupted for an unexpected reason: ${candidate.finishReason}. Please try again.`);
        }

        throw new Error("The AI model did not return any image data. This may be a temporary issue.");
        
    } catch (error) {
        if (error instanceof Error && error.message.toLowerCase().includes('billing')) {
            throw new Error(t.artErrorBillingInfo);
        }
        throw handleGeminiError(error, language);
    }
};

export const generateRandomIdea = async (language: Language): Promise<string> => {
    const langName = translations[language].languageName;
    const prompt = `As an acclaimed A&R executive with a golden ear for hits, pitch a single, modern, and commercially viable song concept in ${langName}. The idea must feel fresh, culturally relevant, and tap into a genuine human emotion. Present it as a high-concept, one-sentence pitch. Return ONLY the pitch, with no extra text, labels, or quotation marks.`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: { temperature: 1.0 }
        });
        return response.text.trim();
    } catch (error) {
        throw handleGeminiError(error, language);
    }
};

export const generateRandomNarrative = async (language: Language): Promise<NarrativeConcept> => {
    const langName = translations[language].languageName;
    const prompt = `You are an elite narrative designer for a top-tier record label. Your task is to generate a complete, artistically profound, and commercially appealing narrative blueprint for a song in ${langName}. The concept must be modern, emotionally intelligent, and contain a unique twist or perspective. Ensure all fields are filled with vivid, interconnected ideas.`;

    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            coreTheme: { type: Type.STRING, description: `The central, universal human truth the song explores in ${langName}. Make it concise and powerful.` },
            story: { type: Type.STRING, description: `A specific, cinematic scenario or moment in time that illustrates the theme in ${langName}.` },
            keyEmotions: { type: Type.STRING, description: `A sophisticated blend of primary and secondary emotions the listener should feel, in ${langName}.` },
            imagery: { type: Type.STRING, description: `A list of striking, symbolic visual metaphors that enhance the story and theme in ${langName}.` },
        },
        required: ['coreTheme', 'story', 'keyEmotions', 'imagery'],
    };

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                temperature: 1.0,
                responseMimeType: "application/json",
                responseSchema: responseSchema,
            },
        });
        
        const narrative = JSON.parse(response.text);
        return narrative;
    } catch (error) {
        throw handleGeminiError(error, language);
    }
};

export const generateNarrativeFromIdea = async (language: Language, mainIdea: string): Promise<NarrativeConcept> => {
    const langName = translations[language].languageName;
    const prompt = `As an elite narrative designer, take the following user-provided song idea and expand it into a complete, artistically profound, and commercially appealing narrative blueprint in ${langName}. Ensure the generated blueprint is directly inspired by and consistent with the user's idea. Fill all fields with vivid, interconnected concepts.
User Idea: "${mainIdea}"`;

    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            coreTheme: { type: Type.STRING, description: `The central, universal human truth the song explores in ${langName}, derived from the user's idea.` },
            story: { type: Type.STRING, description: `A specific, cinematic scenario or moment in time that illustrates the theme in ${langName}, based on the user's idea.` },
            keyEmotions: { type: Type.STRING, description: `A sophisticated blend of primary and secondary emotions the listener should feel, in ${langName}, based on the user's idea.` },
            imagery: { type: Type.STRING, description: `A list of striking, symbolic visual metaphors that enhance the story and theme in ${langName}, based on the user's idea.` },
        },
        required: ['coreTheme', 'story', 'keyEmotions', 'imagery'],
    };

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                temperature: 0.7,
                responseMimeType: "application/json",
                responseSchema: responseSchema,
            },
        });
        
        const narrative = JSON.parse(response.text);
        return narrative;
    } catch (error) {
        throw handleGeminiError(error, language);
    }
};

export interface StyleSuggestion {
    genres: string[];
    moods: string[];
    tempos: string[];
    instruments: string[];
}

export const generateStyleFromArtist = async (artistName: string, language: Language): Promise<StyleSuggestion> => {
    const langName = translations[language].languageName;
    const t = translations[language].options;
    const prompt = `You are a world-class musicologist. Analyze the musical style of the artist "${artistName}".
Based on their typical sound, provide a list of relevant genres, moods, tempos, and instruments in ${langName}.
- For genres, select up to 3 most dominant genres from this list: ${t.GENRES.join(', ')}.
- For moods, select up to 3 most fitting moods from this list: ${t.MOODS.join(', ')}.
- For tempos, select ONLY ONE most representative tempo from this list: ${t.TEMPOS.join(', ')}.
- For instruments, select up to 4 relevant instruments from this list: ${t.INSTRUMENTS.join(', ')}.
Return the result as a JSON object. Ensure all tags are in ${langName}.`;

    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            genres: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: `Up to 3 most dominant genres for the artist in ${langName}.`,
            },
            moods: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: `Up to 3 most fitting moods for the artist in ${langName}.`,
            },
            tempos: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: `Exactly one most representative tempo for the artist in ${langName}.`,
            },
            instruments: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: `Up to 4 relevant instruments for the artist in ${langName}.`,
            },
        },
        required: ['genres', 'moods', 'tempos', 'instruments'],
    };

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                temperature: 0.2,
                responseMimeType: "application/json",
                responseSchema: responseSchema,
            },
        });
        
        const style = JSON.parse(response.text);
        // Ensure tempos is an array and we only take one value, as requested.
        if (!Array.isArray(style.tempos)) {
            style.tempos = [];
        }

        return {
             genres: style.genres || [],
             moods: style.moods || [],
             tempos: style.tempos.slice(0, 1) || [],
             instruments: style.instruments || [],
        };
    } catch (error) {
        throw handleGeminiError(error, language);
    }
};

export const generateStyleFromIdea = async (formState: any, language: Language): Promise<StyleSuggestion> => {
    const langName = translations[language].languageName;
    const t = translations[language].options;
    
    const prompt = `You are a visionary A&R executive. Based on the following song concept, suggest the most commercially viable and artistically fitting musical style. Provide your answer in ${langName}.
- Select up to 3 genres from this list: ${t.GENRES.join(', ')}.
- Select up to 3 moods from this list: ${t.MOODS.join(', ')}.
- Select ONLY ONE tempo from this list: ${t.TEMPOS.join(', ')}.
- Select up to 4 relevant instruments from this list: ${t.INSTRUMENTS.join(', ')}.

Song Concept:
- Main Idea: ${formState.prompt}
- Core Theme: ${formState.coreTheme}
- Story: ${formState.story}
- Key Emotions: ${formState.keyEmotions}
- Imagery: ${formState.imagery}

Return ONLY a JSON object with the keys "genres", "moods", "tempos", and "instruments".`;

    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            genres: { type: Type.ARRAY, items: { type: Type.STRING } },
            moods: { type: Type.ARRAY, items: { type: Type.STRING } },
            tempos: { type: Type.ARRAY, items: { type: Type.STRING } },
            instruments: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['genres', 'moods', 'tempos', 'instruments'],
    };
    
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                temperature: 0.5,
                responseMimeType: "application/json",
                responseSchema: responseSchema,
            },
        });
        
        const style = JSON.parse(response.text);
         if (!Array.isArray(style.tempos)) {
            style.tempos = [];
        }

        return {
             genres: style.genres || [],
             moods: style.moods || [],
             tempos: style.tempos.slice(0, 1) || [],
             instruments: style.instruments || [],
        };
    } catch (error) {
        throw handleGeminiError(error, language);
    }
};

export const generateSongStructure = async (formState: any, language: Language): Promise<string[]> => {
    const langName = translations[language].languageName;
    const p = translations[language].prompts;
    const t = translations[language].options;

    const combinedStyle = [...formState.selectedGenre, ...formState.selectedMood].join(', ');

    const prompt = `As a master songwriter, analyze the following song concept and musical style. Suggest the most effective and conventional song structure in ${langName}.
- Choose from these available parts: ${t.SONG_STRUCTURE_PARTS.join(', ')}.
- The structure should be logical and build emotional momentum.
- Return ONLY a JSON array of strings representing the structure, e.g., ["[Intro]", "[Verse 1]", "[Chorus]"].

Song Concept:
- Main Idea: ${formState.prompt}
- Core Theme: ${formState.coreTheme}
- Musical Style: ${combinedStyle}`;
    
    const responseSchema = {
        type: Type.ARRAY,
        items: { type: Type.STRING, description: `A song structure part, e.g., "[Verse]"` }
    };
    
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                temperature: 0.3,
                responseMimeType: "application/json",
                responseSchema: responseSchema,
            },
        });
        
        const structure = JSON.parse(response.text);
        if (Array.isArray(structure) && structure.every(s => typeof s === 'string')) {
            return structure;
        }
        throw new Error("Invalid structure format returned from AI.");

    } catch (error) {
        throw handleGeminiError(error, language);
    }
};