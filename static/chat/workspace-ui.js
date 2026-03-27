/**
 * Workspace UI management
 */

// State
let workspaces = [];
let currentWorkspaceId = 'default';

/**
 * Fetch workspaces from server
 */
async function fetchWorkspaces() {
  try {
    const res = await fetchJsonOrRedirect('/api/workspaces');
    workspaces = res.workspaces || [];
    currentWorkspaceId = res.currentWorkspaceId || 'default';
    return { workspaces, currentWorkspaceId };
  } catch (error) {
    console.error('[workspaces] Failed to fetch:', error.message);
    workspaces = [{ id: 'default', name: 'Default', defaultFolder: '~' }];
    currentWorkspaceId = 'default';
    return { workspaces, currentWorkspaceId };
  }
}

/**
 * Switch to a different workspace
 */
async function switchWorkspace(workspaceId) {
  if (workspaceId === currentWorkspaceId) return;

  try {
    await fetchJsonOrRedirect('/api/workspaces/current', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId }),
    });
    currentWorkspaceId = workspaceId;
    renderWorkspaceSelect();
    await fetchSessionsList();
  } catch (error) {
    console.error('[workspaces] Failed to switch:', error.message);
  }
}

/**
 * Create a new workspace
 */
async function createNewWorkspace() {
  const name = prompt(t('workspace.newNamePrompt') || 'Workspace name:');
  if (!name || !name.trim()) return;

  try {
    const res = await fetchJsonOrRedirect('/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    });
    if (res.workspace) {
      workspaces.push(res.workspace);
      renderWorkspaceSelect();
      switchWorkspace(res.workspace.id);
    }
  } catch (error) {
    alert(error.message || t('workspace.createFailed') || 'Failed to create workspace');
  }
}

/**
 * Render workspace select dropdown
 */
function renderWorkspaceSelect() {
  if (!workspaceSelect) return;

  workspaceSelect.innerHTML = '';
  for (const ws of workspaces) {
    const option = document.createElement('option');
    option.value = ws.id;
    option.textContent = ws.name;
    if (ws.id === currentWorkspaceId) option.selected = true;
    workspaceSelect.appendChild(option);
  }

  // Add "Manage..." option at the end
  const manageOption = document.createElement('option');
  manageOption.value = '__manage__';
  manageOption.textContent = t('workspace.manage') || 'Manage workspaces...';
  workspaceSelect.appendChild(manageOption);
}

/**
 * Get current workspace
 */
function getCurrentWorkspace() {
  return workspaces.find(w => w.id === currentWorkspaceId) || workspaces[0] || null;
}

/**
 * Get current workspace ID
 */
function getCurrentWorkspaceId() {
  return currentWorkspaceId || 'default';
}

/**
 * Get default folder for current workspace
 */
function getCurrentWorkspaceDefaultFolder() {
  const ws = getCurrentWorkspace();
  return ws?.defaultFolder || '~';
}

/**
 * Initialize workspace UI
 */
async function initWorkspaceUi() {
  await fetchWorkspaces();
  renderWorkspaceSelect();

  // Event listeners
  if (workspaceSelect) {
    workspaceSelect.addEventListener('change', () => {
      const value = workspaceSelect.value;
      if (value === '__manage__') {
        // TODO: Open workspace management modal
        workspaceSelect.value = currentWorkspaceId;
        return;
      }
      switchWorkspace(value);
    });
  }

  if (addWorkspaceBtn) {
    addWorkspaceBtn.addEventListener('click', createNewWorkspace);
  }
}

// Initialize when DOM is ready
if (typeof workspaceSelect !== 'undefined' && workspaceSelect) {
  initWorkspaceUi().catch(console.error);
}
