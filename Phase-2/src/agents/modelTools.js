/**
 * @module Model Tools
 * @description Tools for the Q&A agent to modify the data model (add/remove columns, regenerate, open in browser)
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import config from "../config.js";

const execAsync = promisify(exec);

/**
 * Open a URL in the default browser (cross-platform)
 */
async function openInBrowser(url) {
    const platform = process.platform;
    let command;
    if (platform === "win32") {
        command = `start "" "${url}"`;
    } else if (platform === "darwin") {
        command = `open "${url}"`;
    } else {
        command = `xdg-open "${url}"`;
    }
    try {
        await execAsync(command, { shell: true });
        return true;
    } catch (err) {
        console.error(`Could not open browser: ${err.message}`);
        return false;
    }
}

/**
 * Create model modification tools for the Q&A agent
 * @param {string} fileId - The file ID (artifacts folder)
 * @returns {Array} Array of LangChain tools
 */
export function createModelTools(fileId) {
    const phase1ArtifactsDir = config.phase1ArtifactsDir;
    const metadataPath = path.join(phase1ArtifactsDir, fileId, "json", "metadata.json");
    const phase2Dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

    const applyModelChanges = tool(
        async ({ operationsJson }) => {
            try {
                if (!fs.existsSync(metadataPath)) {
                    return JSON.stringify({ success: false, error: `Metadata not found for fileId: ${fileId}` });
                }
                const raw = fs.readFileSync(metadataPath, "utf-8");
                const doc = JSON.parse(raw);
                const tables = doc.metadata?.tables || {};

                const operations = typeof operationsJson === "string" ? JSON.parse(operationsJson) : operationsJson;
                if (!Array.isArray(operations)) {
                    return JSON.stringify({ success: false, error: "operations must be an array" });
                }

                const applied = [];
                for (const op of operations) {
                    const action = op.action || op.type;
                    const tableName = op.table || op.tableName;

                    if (action === "add_column") {
                        if (!tables[tableName]) {
                            applied.push({ action: "add_column", table: tableName, error: "Table not found" });
                            continue;
                        }
                        const col = {
                            tableName,
                            columnName: op.columnName || op.name,
                            attributeName: op.columnName || op.name,
                            dataType: op.dataType || "VARCHAR",
                            isPrimaryKey: op.isPrimaryKey || false,
                            isForeignKey: op.isForeignKey || false,
                            description: op.description || "",
                            attributeDescription: op.description || "",
                            domain: tables[tableName].domain || "Other",
                            subDomain: tables[tableName].subDomain || "General",
                            entityName: tables[tableName].entityName || tableName,
                            entityDescription: tables[tableName].entityDescription || "",
                        };
                        tables[tableName].columns = tables[tableName].columns || [];
                        tables[tableName].columns.push(col);
                        applied.push({ action: "add_column", table: tableName, column: col.columnName });
                    } else if (action === "remove_column") {
                        if (!tables[tableName]) {
                            applied.push({ action: "remove_column", table: tableName, error: "Table not found" });
                            continue;
                        }
                        const colName = op.columnName || op.name;
                        tables[tableName].columns = (tables[tableName].columns || []).filter(
                            (c) => (c.columnName || c.attributeName) !== colName
                        );
                        applied.push({ action: "remove_column", table: tableName, column: colName });
                    } else if (action === "modify_column") {
                        if (!tables[tableName]) {
                            applied.push({ action: "modify_column", table: tableName, error: "Table not found" });
                            continue;
                        }
                        const colName = op.columnName || op.name;
                        const col = (tables[tableName].columns || []).find(
                            (c) => (c.columnName || c.attributeName) === colName
                        );
                        if (!col) {
                            applied.push({ action: "modify_column", table: tableName, column: colName, error: "Column not found" });
                            continue;
                        }
                        if (op.dataType) col.dataType = op.dataType;
                        if (op.description !== undefined) {
                            col.description = op.description;
                            col.attributeDescription = op.description;
                        }
                        applied.push({ action: "modify_column", table: tableName, column: colName });
                    }
                }

                fs.writeFileSync(metadataPath, JSON.stringify(doc, null, 2), "utf-8");
                return JSON.stringify({ success: true, applied, message: `Applied ${applied.length} operation(s)` });
            } catch (err) {
                return JSON.stringify({ success: false, error: err.message });
            }
        },
        {
            name: "apply_model_changes",
            description: "Apply changes to the data model. Use when user asks to add, remove, or modify columns. Pass operations as JSON array of {action, table, columnName, dataType?, description?}",
            schema: z.object({
                operationsJson: z.string().describe("JSON array of operations. Each: {action:'add_column'|'remove_column'|'modify_column', table:'tableName', columnName:'colName', dataType?:'VARCHAR', description?:'...'}"),
            }),
        }
    );

    const regenerateModel = tool(
        async (_input) => {
            try {
                const { spawn } = await import("child_process");
                const genPath = path.join(phase2Dir, "generate.js");
                return new Promise((resolve) => {
                    const proc = spawn("node", [genPath, fileId], {
                        cwd: phase2Dir,
                        shell: true,
                        stdio: ["ignore", "pipe", "pipe"],
                    });
                    let stdout = "";
                    let stderr = "";
                    proc.stdout?.on("data", (d) => { stdout += d.toString(); });
                    proc.stderr?.on("data", (d) => { stderr += d.toString(); });
                    proc.on("close", (code) => {
                        if (code === 0) {
                            resolve(JSON.stringify({ success: true, message: "Model regenerated successfully" }));
                        } else {
                            resolve(JSON.stringify({ success: false, error: stderr || stdout || `Exit code ${code}` }));
                        }
                    });
                    proc.on("error", (err) => resolve(JSON.stringify({ success: false, error: err.message })));
                });
            } catch (err) {
                return JSON.stringify({ success: false, error: err.message });
            }
        },
        {
            name: "regenerate_model",
            description: "Regenerate the SQL and HTML diagram from the current metadata. Use when user asks to regenerate, refresh, or rebuild the model.",
            schema: z.object({}),
        }
    );

    const openModel = tool(
        async (_input) => {
            const port = process.env.PORT || 3000;
            const url = `http://localhost:${port}/artifacts/${fileId}/executive/DATA_MODEL_DUAL_ENHANCED.html`;
            const htmlPath = path.join(phase1ArtifactsDir, fileId, "executive", "DATA_MODEL_DUAL_ENHANCED.html");
            let opened = false;
            if (fs.existsSync(htmlPath)) {
                const fileUrl = `file:///${htmlPath.replace(/\\/g, "/")}`;
                opened = await openInBrowser(fileUrl);
            }
            if (!opened) {
                opened = await openInBrowser(url);
            }
            return JSON.stringify({
                success: opened,
                message: opened ? "Opened model in browser" : "Could not open browser. Visit: " + url,
                url: url,
            });
        },
        {
            name: "open_model",
            description: "Open the interactive data model diagram in the default browser. Use when user asks to open, show, or view the model/diagram.",
            schema: z.object({}),
        }
    );

    return [applyModelChanges, regenerateModel, openModel];
}
