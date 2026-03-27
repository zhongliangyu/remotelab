// ---- Sidebar ----
function t(key, vars) {
  return window.remotelabT ? window.remotelabT(key, vars) : key;
}

function openSidebar() {
  sidebarOverlay.classList.add("open");
}
function closeSidebarFn() {
  sidebarOverlay.classList.remove("open");
}

function openSessionsSidebar() {
  if (typeof switchTab === "function") {
    switchTab("sessions");
  }
  openSidebar();
  return true;
}

// ---- New Session Modal ----
function openNewSessionModal() {
  if (!newSessionModal) return;
  const defaultFolder = typeof getCurrentWorkspaceDefaultFolder === 'function'
    ? getCurrentWorkspaceDefaultFolder()
    : '~';
  newSessionModal.hidden = false;
  newSessionFolderInput.value = defaultFolder;
  newSessionFolderSuggestions.innerHTML = "";
  newSessionNameInput.value = "";
  populateNewSessionToolSelect();
  newSessionFolderInput.focus();
}

function closeNewSessionModal() {
  if (!newSessionModal) return;
  newSessionModal.hidden = true;
}

function populateNewSessionToolSelect() {
  if (!newSessionToolSelect) return;
  const toolOptions = Array.isArray(toolsList) ? toolsList : [];
  const preferredValue = preferredTool || selectedTool || toolOptions[0]?.id || "";
  newSessionToolSelect.innerHTML = "";
  if (toolOptions.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = t("modal.noTools");
    newSessionToolSelect.appendChild(option);
    newSessionToolSelect.disabled = true;
    return;
  }
  toolOptions.forEach((tool) => {
    const option = document.createElement("option");
    option.value = tool.id || "";
    option.textContent = tool.label || tool.id || "";
    if (tool.id === preferredValue) option.selected = true;
    newSessionToolSelect.appendChild(option);
  });
  newSessionToolSelect.disabled = false;
}

async function handleCreateNewSession() {
  const folder = newSessionFolderInput?.value?.trim() || "~";
  const tool = newSessionToolSelect?.value || preferredTool || selectedTool || toolsList[0]?.id;
  const name = newSessionNameInput?.value?.trim() || "";
  const workspaceId = typeof getCurrentWorkspaceId === 'function'
    ? getCurrentWorkspaceId()
    : 'default';
  if (!tool) return;

  closeNewSessionModal();
  if (!isDesktop) closeSidebarFn();
  if (typeof switchTab === "function") {
    switchTab("sessions");
  }

  return dispatchAction({
    action: "create",
    folder,
    tool,
    name,
    workspaceId,
    sourceId: DEFAULT_APP_ID,
    sourceName: DEFAULT_APP_NAME,
  });
}

// Folder autocomplete
let folderAcTimer = null;
function setupFolderAutocomplete() {
  if (!newSessionFolderInput || !newSessionFolderSuggestions) return;
  newSessionFolderInput.addEventListener("input", () => {
    clearTimeout(folderAcTimer);
    folderAcTimer = setTimeout(async () => {
      const q = newSessionFolderInput.value.trim();
      if (q.length < 2) {
        newSessionFolderSuggestions.innerHTML = "";
        return;
      }
      try {
        const res = await fetch(`/api/autocomplete?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        newSessionFolderSuggestions.innerHTML = "";
        for (const s of (data.suggestions || []).slice(0, 5)) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.textContent = s.replace(/^\/Users\/[^/]+/, "~");
          btn.onclick = () => {
            newSessionFolderInput.value = s;
            newSessionFolderSuggestions.innerHTML = "";
          };
          newSessionFolderSuggestions.appendChild(btn);
        }
      } catch {}
    }, 200);
  });
}

function createNewSessionShortcut({ closeSidebar = true } = {}) {
  openNewSessionModal();
  return true;
}

function createSortSessionListShortcut() {
  return organizeSessionListWithAgent({ closeSidebar: false });
}

// Modal event listeners
if (newSessionBtn) {
  newSessionBtn.addEventListener("click", openNewSessionModal);
}
if (closeNewSessionModalBtn) {
  closeNewSessionModalBtn.addEventListener("click", closeNewSessionModal);
}
if (cancelNewSessionModalBtn) {
  cancelNewSessionModalBtn.addEventListener("click", closeNewSessionModal);
}
if (newSessionModal) {
  newSessionModal.addEventListener("click", (e) => {
    if (e.target === newSessionModal) closeNewSessionModal();
  });
}
if (createNewSessionBtn) {
  createNewSessionBtn.addEventListener("click", handleCreateNewSession);
}
setupFolderAutocomplete();

menuBtn.addEventListener("click", openSessionsSidebar);
closeSidebar.addEventListener("click", closeSidebarFn);
sidebarOverlay.addEventListener("click", (e) => {
  if (e.target === sidebarOverlay && !isDesktop) closeSidebarFn();
});

// ---- Session list actions ----
sortSessionListBtn.addEventListener("click", () => {
  void createSortSessionListShortcut();
});

// ---- Attachment handling ----
function buildPendingAttachment(file) {
  return {
    file,
    originalName: typeof file?.name === "string" ? file.name : "",
    mimeType: file.type || "application/octet-stream",
    ...(Number.isFinite(file?.size) ? { sizeBytes: file.size } : {}),
    objectUrl: URL.createObjectURL(file),
  };
}

async function addAttachmentFiles(files) {
  if (typeof hasPendingComposerSend === "function" && hasPendingComposerSend()) {
    return;
  }
  if (!currentSessionId) {
    return;
  }
  if (typeof addComposerAttachmentsState === "function") {
    addComposerAttachmentsState(
      Array.from(files || [], (file) => buildPendingAttachment(file)),
      { sessionId: currentSessionId },
    );
  }
  renderImagePreviews();
}

function renderImagePreviews() {
  const pendingImages = currentSessionId && typeof getComposerAttachmentsState === "function"
    ? getComposerAttachmentsState(currentSessionId)
    : [];
  imgPreviewStrip.innerHTML = "";
  if (pendingImages.length === 0) {
    imgPreviewStrip.classList.remove("has-images");
    if (typeof requestLayoutPass === "function") {
      requestLayoutPass("composer-images");
    } else if (typeof syncInputHeightForLayout === "function") {
      syncInputHeightForLayout();
    }
    return;
  }
  imgPreviewStrip.classList.add("has-images");
  const attachmentsLocked = typeof hasPendingComposerSend === "function" && hasPendingComposerSend();
  pendingImages.forEach((img, i) => {
    const item = document.createElement("div");
    item.className = "img-preview-item";
    const previewNode = createComposerAttachmentPreviewNode(img);
    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-img";
    removeBtn.type = "button";
    removeBtn.title = t("action.removeAttachment");
    removeBtn.setAttribute("aria-label", t("action.removeAttachment"));
    removeBtn.innerHTML = renderUiIcon("close");
    removeBtn.disabled = attachmentsLocked;
    removeBtn.onclick = () => {
      if (attachmentsLocked) return;
      URL.revokeObjectURL(img.objectUrl);
      if (typeof removeComposerAttachmentState === "function") {
        removeComposerAttachmentState(i, { sessionId: currentSessionId });
      }
      renderImagePreviews();
    };
    if (previewNode) {
      item.appendChild(previewNode);
    }
    item.appendChild(removeBtn);
    imgPreviewStrip.appendChild(item);
  });
  if (typeof requestLayoutPass === "function") {
    requestLayoutPass("composer-images");
  } else if (typeof syncInputHeightForLayout === "function") {
    syncInputHeightForLayout();
  }
}

imgBtn.addEventListener("click", () => {
  if (typeof hasPendingComposerSend === "function" && hasPendingComposerSend()) {
    return;
  }
  imgFileInput.click();
});
imgFileInput.addEventListener("change", () => {
  if (imgFileInput.files.length > 0) addAttachmentFiles(imgFileInput.files);
  imgFileInput.value = "";
});

msgInput.addEventListener("paste", (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  const attachmentFiles = [];
  for (const item of items) {
    const file = typeof item.getAsFile === "function" ? item.getAsFile() : null;
    if (file) attachmentFiles.push(file);
  }
  if (attachmentFiles.length > 0) {
    e.preventDefault();
    addAttachmentFiles(attachmentFiles);
  }
});
