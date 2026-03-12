/**
 * @description this is the configuration file for the project
 * we dont have to import all the env files here we can use in the config to use it and import it..!
 */

import dotenv from 'dotenv';
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const config = {
    //Paths..!
    //either get the data from the env file or else create the folder for it..!
    phase1ArtifactsDir: process.env.PHASE1_ARTIFACTS_DIR || path.resolve(__dirname, '../../Phase-1/artifacts'),


    //Output-Settings..!
    generateSQL: process.env.GENERATE_SQL !== 'false',
    generateERD: process.env.GENERATE_ERD !== 'false',
    erdFormats: (process.env.ERD_FORMATS || "png,svg,pdf").split(","),

    // Large schema settings
    largeSchemaThreshold: {
        lines: 500,
        entities: 20
    },

    // Logging
    logLevel: process.env.LOG_LEVEL || 'info',

    // Q&A Agent: max context size to avoid token limit (300K model limit; ~4 chars/token)
    // Default 1M chars ≈ 250K tokens, leaving room for system prompt, history, question, response
    maxContextChars: parseInt(process.env.QA_MAX_CONTEXT_CHARS || '1000000', 10) || 1000000,
};

export default config;