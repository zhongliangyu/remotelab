/**
 * Workspace management for RemoteLab
 *
 * Workspaces provide a top-level organization layer above sessions.
 * Each session belongs to exactly one workspace.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { CONFIG_DIR } from '../lib/config.mjs';

const WORKSPACES_FILE = 'workspaces.json';
const WORKSPACES_PATH = join(CONFIG_DIR, WORKSPACES_FILE);

let workspacesCache = null;
let currentWorkspaceId = null;

/**
 * Get default workspace (creates if not exists)
 */
const DEFAULT_WORKSPACE = {
  id: 'default',
  name: 'Default',
  defaultFolder: '~',
  createdAt: new Date().toISOString(),
};

/**
 * Load workspaces from disk
 */
export async function loadWorkspaces() {
  try {
    if (!existsSync(WORKSPACES_PATH)) {
      // Create default workspaces file
      const defaultWorkspaces = [DEFAULT_WORKSPACE];
      await mkdir(CONFIG_DIR, { recursive: true });
      await writeFile(WORKSPACES_PATH, JSON.stringify(defaultWorkspaces, null, 2));
      workspacesCache = defaultWorkspaces;
      return defaultWorkspaces;
    }

    const content = await readFile(WORKSPACES_PATH, 'utf-8');
    const workspaces = JSON.parse(content);

    if (!Array.isArray(workspaces) || workspaces.length === 0) {
      workspacesCache = [DEFAULT_WORKSPACE];
      return workspacesCache;
    }

    // Ensure default workspace exists
    if (!workspaces.find(w => w.id === 'default')) {
      workspaces.unshift(DEFAULT_WORKSPACE);
    }

    workspacesCache = workspaces;
    return workspaces;
  } catch (error) {
    console.error('[workspaces] Failed to load workspaces:', error.message);
    workspacesCache = [DEFAULT_WORKSPACE];
    return workspacesCache;
  }
}

/**
 * Save workspaces to disk
 */
async function saveWorkspaces(workspaces) {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(WORKSPACES_PATH, JSON.stringify(workspaces, null, 2));
  workspacesCache = workspaces;
}

/**
 * Get all workspaces
 */
export async function getWorkspaces() {
  if (workspacesCache) {
    return workspacesCache;
  }
  return loadWorkspaces();
}

/**
 * Get workspace by ID
 */
export async function getWorkspace(id) {
  const workspaces = await getWorkspaces();
  return workspaces.find(w => w.id === id) || null;
}

/**
 * Create a new workspace
 */
export async function createWorkspace(data = {}) {
  const workspaces = await getWorkspaces();

  const id = data.id || uuidv4();
  const name = (data.name || 'New Workspace').trim();
  const defaultFolder = (data.defaultFolder || '~').trim();

  // Check for duplicate name
  if (workspaces.find(w => w.name.toLowerCase() === name.toLowerCase())) {
    throw new Error(`Workspace "${name}" already exists`);
  }

  const workspace = {
    id,
    name,
    defaultFolder,
    createdAt: new Date().toISOString(),
  };

  workspaces.push(workspace);
  await saveWorkspaces(workspaces);

  return workspace;
}

/**
 * Update a workspace
 */
export async function updateWorkspace(id, updates = {}) {
  const workspaces = await getWorkspaces();
  const index = workspaces.findIndex(w => w.id === id);

  if (index === -1) {
    throw new Error(`Workspace not found: ${id}`);
  }

  const workspace = workspaces[index];

  // Cannot modify default workspace id
  if (id === 'default' && updates.id && updates.id !== 'default') {
    throw new Error('Cannot change default workspace ID');
  }

  // Check for duplicate name
  if (updates.name) {
    const duplicate = workspaces.find(w =>
      w.id !== id && w.name.toLowerCase() === updates.name.toLowerCase()
    );
    if (duplicate) {
      throw new Error(`Workspace "${updates.name}" already exists`);
    }
  }

  const updated = {
    ...workspace,
    ...updates,
    id: workspace.id, // Prevent ID changes
    updatedAt: new Date().toISOString(),
  };

  workspaces[index] = updated;
  await saveWorkspaces(workspaces);

  return updated;
}

/**
 * Delete a workspace
 */
export async function deleteWorkspace(id) {
  if (id === 'default') {
    throw new Error('Cannot delete default workspace');
  }

  const workspaces = await getWorkspaces();
  const index = workspaces.findIndex(w => w.id === id);

  if (index === -1) {
    throw new Error(`Workspace not found: ${id}`);
  }

  workspaces.splice(index, 1);
  await saveWorkspaces(workspaces);

  return true;
}

/**
 * Get current workspace ID
 */
export function getCurrentWorkspaceId() {
  return currentWorkspaceId || 'default';
}

/**
 * Set current workspace ID
 */
export function setCurrentWorkspaceId(id) {
  currentWorkspaceId = id;
}

/**
 * Get workspace summary for API responses
 */
export function getWorkspaceSummary(workspace) {
  if (!workspace) return null;
  return {
    id: workspace.id,
    name: workspace.name,
    defaultFolder: workspace.defaultFolder || '~',
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
  };
}
