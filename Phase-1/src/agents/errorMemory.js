/**
 * @module Error Memory
 * @description Stores recent errors for learning - helps avoid repeating past mistakes
 */

const MAX_ERRORS = 50;
let errorMemory = [];

/**
 * Record a failed attempt for future reference
 * @param {string} step - Step or context where error occurred
 * @param {string} error - Error message
 * @param {Object} [context] - Optional additional context
 */
export function recordError(step, error, context = {}) {
    errorMemory.push({
        step,
        error: typeof error === 'string' ? error : (error?.message || String(error)),
        context,
        timestamp: Date.now(),
    });
    if (errorMemory.length > MAX_ERRORS) {
        errorMemory = errorMemory.slice(-MAX_ERRORS);
    }
}

/**
 * Get formatted error text for inclusion in prompts
 * @returns {string} Formatted error summary for LLM context
 */
export function getErrorsForPrompt() {
    if (errorMemory.length === 0) return "";
    const recent = errorMemory.slice(-10);
    const lines = recent.map((e, i) => 
        `- [${i + 1}] ${e.step}: ${e.error}`
    );
    return `\n\nRECENT ERRORS TO AVOID:\n${lines.join('\n')}\n`;
}

/**
 * Clear error memory at the start of each run
 */
export function clearErrorMemory() {
    errorMemory = [];
}
