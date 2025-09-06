// DOM elements
const fileInput = document.getElementById('file-input');
const filesContainer = document.getElementById('files-container');
const fileModal = document.getElementById('file-modal');
const modalContent = document.getElementById('modal-content');
const modalTitle = document.getElementById('modal-title');
const closeModal = document.getElementById('close-modal');

// Array to keep track of files to send
let filesToSend = [];

// File type to icon mapping
const fileIcons = {
  'pdf': 'fa-file-pdf',
  'doc': 'fa-file-word',
  'docx': 'fa-file-word',
  'xls': 'fa-file-excel',
  'xlsx': 'fa-file-excel',
  'ppt': 'fa-file-powerpoint',
  'pptx': 'fa-file-powerpoint',
  'txt': 'fa-file-alt',
  'zip': 'fa-file-archive',
  'rar': 'fa-file-archive',
  'mp3': 'fa-file-audio',
  'wav': 'fa-file-audio',
  'default': 'fa-file'
};

// File input change handler
fileInput.addEventListener('change', (e) => {
  Array.from(e.target.files).forEach(file => {
    if (!filesToSend.includes(file)) {
      filesToSend.push(file);
      const preview = createFilePreview(file);
      filesContainer.appendChild(preview);
    }
  });
  fileInput.value = ''; // Reset input to allow selecting same files again
});

// Create file preview element
function createFilePreview(file) {
  const fileBox = document.createElement("div");
  fileBox.classList.add("file-box");
  
  const closeBtn = document.createElement("div");
  closeBtn.classList.add("close-btn");
  closeBtn.innerText = "×";
  closeBtn.onclick = (e) => {
    e.stopPropagation();
    fileBox.remove();
    filesToSend = filesToSend.filter(f => f !== file);
    URL.revokeObjectURL(file.objectUrl); // Clean up memory
  };

  // Get file extension
  const fileExt = file.name.split('.').pop().toLowerCase();
  
  if (file.type.startsWith("image/")) {
    const img = document.createElement("img");
    img.src = URL.createObjectURL(file);
    fileBox.appendChild(img);
    fileBox.onclick = () => previewFile(file);
  } 
  else if (file.type.startsWith("video/")) {
    const video = document.createElement("video");
    video.src = URL.createObjectURL(file);
    video.setAttribute("preload", "metadata");
    fileBox.appendChild(video);
    fileBox.onclick = () => previewFile(file);
  }
  else {
    // For non-previewable files, show an icon based on file type
    const iconBox = document.createElement("div");
    iconBox.classList.add("file-icon-box");
    
    const icon = document.createElement("i");
    icon.classList.add("fas");
    icon.classList.add(fileIcons[fileExt] || fileIcons['default']);
    
    iconBox.appendChild(icon);
    
    // Add file name
    const fileName = document.createElement("div");
    fileName.classList.add("file-name");
    fileName.textContent = file.name.length > 15 
      ? `${file.name.substring(0, 12)}...${fileExt}` 
      : file.name;
    
    fileBox.appendChild(iconBox);
    fileBox.appendChild(fileName);
    fileBox.onclick = () => previewFile(file);
  }
  
  // Store the object URL for cleanup later
  file.objectUrl = fileBox.querySelector('img, video')?.src;
  
  fileBox.appendChild(closeBtn);
  return fileBox;
}

// Preview file in modal
function previewFile(file) {
  modalContent.innerHTML = '';
  modalTitle.textContent = file.name;
  
  if (file.type.startsWith("image/")) {
    const img = document.createElement("img");
    img.src = URL.createObjectURL(file);
    modalContent.appendChild(img);
  } 
  else if (file.type.startsWith("video/")) {
    const video = document.createElement("video");
    video.src = URL.createObjectURL(file);
    video.controls = true;
    video.autoplay = true;
    modalContent.appendChild(video);
  } 
  else if (file.type === "application/pdf") {
    const iframe = document.createElement("iframe");
    iframe.classList.add("pdf-viewer");
    iframe.src = URL.createObjectURL(file);
    modalContent.appendChild(iframe);
  }
  else {
    // For non-previewable files, show download option
    const downloadBox = document.createElement("div");
    downloadBox.classList.add("download-box");
    
    const icon = document.createElement("i");
    const fileExt = file.name.split('.').pop().toLowerCase();
    icon.classList.add("fas");
    icon.classList.add(fileIcons[fileExt] || fileIcons['default']);
    icon.style.fontSize = "50px";
    icon.style.marginBottom = "20px";
    
    const downloadBtn = document.createElement("button");
    downloadBtn.textContent = "Download File";
    downloadBtn.classList.add("download-btn");
    downloadBtn.onclick = () => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(file);
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(a.href);
    };
    
    downloadBox.appendChild(icon);
    downloadBox.appendChild(document.createElement("br"));
    downloadBox.appendChild(downloadBtn);
    modalContent.appendChild(downloadBox);
  }
  
  fileModal.style.display = "flex";
}

// Close modal handlers
closeModal.addEventListener("click", () => {
  closeModalHandler();
});

fileModal.addEventListener("click", (e) => {
  if (e.target === fileModal) {
    closeModalHandler();
  }
});

function closeModalHandler() {
  fileModal.style.display = "none";
  // Revoke object URLs to free memory
  Array.from(modalContent.children).forEach(child => {
    if (child.src) URL.revokeObjectURL(child.src);
  });
}

// Drag and drop functionality
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
  filesContainer.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

['dragenter', 'dragover'].forEach(eventName => {
  filesContainer.addEventListener(eventName, highlight, false);
});

['dragleave', 'drop'].forEach(eventName => {
  filesContainer.addEventListener(eventName, unhighlight, false);
});

function highlight() {
  filesContainer.classList.add('highlight');
}

function unhighlight() {
  filesContainer.classList.remove('highlight');
}

filesContainer.addEventListener('drop', handleDrop, false);

function handleDrop(e) {
  const dt = e.dataTransfer;
  const files = dt.files;
  
  Array.from(files).forEach(file => {
    if (!filesToSend.includes(file)) {
      filesToSend.push(file);
      const preview = createFilePreview(file);
      filesContainer.appendChild(preview);
    }
  });
}