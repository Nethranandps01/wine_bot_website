// embed_and_store.js

import { GoogleGenerativeAI } from '@google/generative-ai';
import { QdrantClient } from '@qdrant/js-client-rest';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid'; // Optional: For generating unique IDs
import jsonData from './wine-data.json' assert { type: 'json' };

dotenv.config(); // Load environment variables from .env file

// --- Configuration ---
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const QDRANT_URL = process.env.QDRANT_URL;
const QDRANT_API_KEY = process.env.QDRANT_API_KEY; // Optional
const QDRANT_COLLECTION_NAME = process.env.QDRANT_COLLECTION_NAME;
const EMBEDDING_MODEL = 'text-embedding-004';
const VECTOR_SIZE = 768; // Update vector size to match actual embedding dimension

// --- Input Data ---
// Replace this with your actual JSON data loading mechanism (e.g., reading from a file)

// --- Field Configuration ---
// Specify which field(s) in your JSON objects contain the text to be embedded.
// You can combine multiple fields if needed before embedding.
const textField = 'name'; // The key in your JSON objects holding the text

// Optional: Specify a field to use as the unique ID for Qdrant points.
// If null, a UUID will be generated.
const idField = 'skuId'; // The key in your JSON objects to use as the Qdrant point ID

// --- Helper Function: Generate Embedding ---
async function generateEmbedding(text, genAI) {
    try {
        const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
        const result = await model.embedContent(text);
        const embedding = result.embedding;
        if (!embedding || !embedding.values) {
            throw new Error('Invalid embedding structure received from API');
        }
        // console.log(`Generated embedding for text (first 5 values): ${text.substring(0, 30)}... -> [${embedding.values.slice(0, 5).join(', ')}...]`);
        return embedding.values;
    } catch (error) {
        console.error(`Error generating embedding for text: "${text.substring(0, 50)}..."`, error.message);
        if (error.response) {
            console.error('API Response Data:', error.response.data);
        }
        throw error; // Re-throw to stop processing if needed, or return null/handle differently
    }
}

// --- Main Processing Function ---
async function processAndStoreData() {
    console.log("Starting script...");

    // --- Validation ---
    if (!GOOGLE_API_KEY) {
        console.error("Error: GOOGLE_API_KEY is not set in the .env file.");
        return;
    }
    if (!QDRANT_URL) {
        console.error("Error: QDRANT_URL is not set in the .env file.");
        return;
    }
    if (!QDRANT_COLLECTION_NAME) {
        console.error("Error: QDRANT_COLLECTION_NAME is not set in the .env file.");
        return;
    }
    if (!jsonData || jsonData.length === 0) {
        console.error("Error: Input JSON data is empty.");
        return;
    }
    if (!jsonData[0].hasOwnProperty(textField)) {
         console.error(`Error: The specified text field "${textField}" does not exist in the first JSON object.`);
         return;
    }
     if (idField && !jsonData[0].hasOwnProperty(idField)) {
         console.warn(`Warning: The specified id field "${idField}" does not exist in the first JSON object. UUIDs will be generated instead.`);
         // Fallback to UUIDs if specified idField is missing
         // idField = null; // Or handle as an error if ID is mandatory
    }
    

    // --- Initialize Clients ---
    console.log("Initializing Google GenAI client...");
    const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);

    console.log(`Initializing Qdrant client for URL: ${QDRANT_URL}...`);
    const qdrantClient = new QdrantClient({
        url: QDRANT_URL,
        apiKey: QDRANT_API_KEY, // Pass API key if configured
    });

    console.log(`Using Qdrant collection: ${QDRANT_COLLECTION_NAME}`);
    console.log(`Using Google embedding model: ${EMBEDDING_MODEL}`);

    // --- Creating collection ---

    try {
        await qdrantClient.createCollection(QDRANT_COLLECTION_NAME, {
            vectors: {
                default: {
                    size: VECTOR_SIZE, // Use the constant instead of hardcoded value
                    distance: 'Cosine', // Distance metric
                }
            }
        });
        console.log(`Collection '${QDRANT_COLLECTION_NAME}' created successfully.`);
    } catch (error) {
        console.log(error);
        console.error(`Error creating collection: ${error.message}`);
        if (error.response) {
            console.error('Qdrant API Response Data:', await error.response.json()); // Log detailed error from Qdrant
        }
        return;
    }

    // --- Process Data and Prepare for Qdrant ---
    const pointsToUpsert = [];
    let processedCount = 0;
    const totalCount = jsonData.length;

    console.log(`Processing ${totalCount} items...`);

    for (const item of jsonData) {
        processedCount++;
        const textToEmbed = item[textField];
        const itemId = uuidv4(); // Use specified ID or generate UUID

        if (!textToEmbed || typeof textToEmbed !== 'string' || textToEmbed.trim() === '') {
            console.warn(`Skipping item with ID ${itemId} due to empty or invalid text content.`);
            continue;
        }

        console.log(`[${processedCount}/${totalCount}] Generating embedding for ID: ${itemId}`);
        try {
            const vector = await generateEmbedding(textToEmbed, genAI);

            if (vector) {
                 // The payload contains only the specified fields
                const payload = {
                    name: item.name,
                    price: item.price && item.price.length > 0 ? item.price[0].price : null,
                    imageUrl: item.images && item.images.length > 0 ? item.images[0].url : null,
                    productUrl: item.productUrl,
                    rating: item.rating,
                    stockLevel: item.stockLevel && item.stockLevel.length > 0 ? 
                        (item.stockLevel[0].stock !== undefined ? item.stockLevel[0].stock : null) : null
                };

                pointsToUpsert.push({
                    id: itemId,
                    vector: {
                        default: vector
                    },
                    payload: payload,
                });
                console.log(`   Prepared point for ID: ${itemId}`);
            } else {
                 console.warn(`   Skipping item ID ${itemId} due to embedding generation failure.`);
            }

            // Optional: Add a small delay to avoid hitting rate limits, especially for large datasets
            // await new Promise(resolve => setTimeout(resolve, 50)); // 50ms delay

        } catch (error) {
            console.error(`Failed to process item ID ${itemId}. Skipping. Error: ${error.message}`);
            // Decide if you want to stop the whole process on error or just skip the item
            // return; // Uncomment to stop on first error
        }
    }

    // --- Store Data in Qdrant ---
    if (pointsToUpsert.length > 0) {
        console.log(`\nUpserting ${pointsToUpsert.length} points to Qdrant collection '${QDRANT_COLLECTION_NAME}'...`);
        try {
            // Use upsert for inserting or updating points
            const result = await qdrantClient.upsert(QDRANT_COLLECTION_NAME, {
                wait: true, // Wait for the operation to be acknowledged
                points: pointsToUpsert,
            });
            console.log("Qdrant upsert successful:", result);
        } catch (error) {
            console.error("Error upserting points to Qdrant:", error);
             if (error.response) {
                console.error('Qdrant API Response Data:', await error.response.json()); // Log detailed error from Qdrant
            }
        }
    } else {
        console.log("\nNo points were generated to upsert.");
    }

    console.log("\nScript finished.");
}

// --- Run the script ---
processAndStoreData().catch(error => {
    console.error("An unexpected error occurred:", error);
});
