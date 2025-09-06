window.addEventListener('DOMContentLoaded', () => {
  updateSendButtonState();
  setupSpeechRecognition();
  // Preload voices for Web Speech API
  window.speechSynthesis.onvoiceschanged = () => {
    window.speechSynthesis.getVoices();
  };
});

const textarea = document.getElementById("chatInput");
const fileInput = document.getElementById("fileInput");
const fileInputTrigger = document.getElementById("fileInputTrigger");
const filePreviewContainer = document.getElementById("filePreviewContainer");
const chatArea = document.getElementById("chatArea");
const sendBtn = document.getElementById("sendBtn");
const micBtn = document.getElementById("micBtn");
const fileModal = document.getElementById("fileModal");
const modalContent = document.getElementById("modalContent");
const modalTitle = document.getElementById("modalTitle");
const closeModal = document.querySelector(".close-modal");

let filesToSend = [];
let sentMessages = [];
let conversationHistory = [];
let isProcessing = false;
let abortController = null;
let thinkingMessageId = null;
let currentResponseId = null; // New variable to track current response message ID
let recognition = null;
let isMicActive = false;
let isVoiceInput = false;
let speechSynthesisUtterance = null;
let micTimeout = null;
let isSpeaking = false;
let lastSpeechTime = 0;
let isAnimating = false;
let animationInterval = null;

function updateSendButtonState() {
  const msg = textarea.value.trim();
  sendBtn.classList.toggle('disabled', !msg && filesToSend.length === 0 && !isProcessing);
  sendBtn.title = msg || filesToSend.length > 0 ? "Send" : isProcessing ? "Processing... Click to cancel" : "Type a message to send";
}

function setLoadingState() {
  isProcessing = true;
  sendBtn.classList.add('loading');
  sendBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
  sendBtn.disabled = false;
  sendBtn.title = "Processing... Click to cancel";
}

function resetSendButton() {
  isProcessing = false;
  isAnimating = false;
  sendBtn.classList.remove('loading');
  sendBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
  sendBtn.disabled = false;
  abortController = null;
  currentResponseId = null;
  updateSendButtonState();
}

function stopProcessing() {
  if (isProcessing && abortController) {
    abortController.abort();
    stopSpeaking();
    if (isAnimating && animationInterval) {
      clearTimeout(animationInterval);
      isAnimating = false;
      if (currentResponseId) {
        const currentMessage = document.getElementById(`msg-${currentResponseId}`);
        if (currentMessage) {
          const pen = currentMessage.querySelector('.writing-pen');
          if (pen) pen.remove(); // Explicitly hide the writing pen
          const messageContent = currentMessage.querySelector('.message-content');
          if (messageContent && messageContent.textContent.trim()) {
            messageContent.style.display = 'block';
          }
        }
      }
    }
    resetSendButton();
    removeThinkingMessage();
    addTextMessage("Response stopped by user.", 'received', Date.now());
    chatArea.scrollTop = chatArea.scrollHeight;
  }
}

function setupSpeechRecognition() {
  if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
    console.warn("Speech Recognition API not supported in this browser.");
    micBtn.disabled = true;
    micBtn.title = "Speech recognition not supported";
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-IN';

  recognition.onresult = (event) => {
    if (isSpeaking && Date.now() - lastSpeechTime < 500) return;

    let interimTranscript = '';
    let finalTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript;
      } else {
        interimTranscript += transcript;
      }
    }

    textarea.value = finalTranscript || interimTranscript;
    updateSendButtonState();

    const interruptKeywords = ['stop', 'ruko', 'cancel', 'band karo', 'halt', 'ruk jao'];
    if (finalTranscript && interruptKeywords.some(keyword => finalTranscript.toLowerCase().includes(keyword)) && isProcessing) {
      stopProcessing();
      return;
    }

    if (finalTranscript) {
      isVoiceInput = true;
      textarea.value = finalTranscript;
      const lang = detectLanguage(finalTranscript);
      recognition.lang = lang;
      sendBtn.click();
      resetMicTimeout();
    } else {
      resetMicTimeout();
    }
  };

  recognition.onerror = (event) => {
    console.error("Speech recognition error:", event.error);
    if (event.error === 'no-speech' || event.error === 'aborted') {
      if (isMicActive) {
        setTimeout(() => {
          try {
            recognition.start();
          } catch (e) {
            console.warn("Failed to restart recognition after error:", e);
            toggleMic(false);
            addTextMessage("Speech recognition stopped. Please try again.", 'received', Date.now());
          }
        }, 1000);
      }
      return;
    }
    addTextMessage("Speech recognition error. Please try again.", 'received', Date.now());
    toggleMic(false);
  };

  recognition.onend = () => {
    if (isMicActive && !isSpeaking) {
      setTimeout(() => {
        try {
          navigator.permissions.query({ name: 'microphone' }).then(permissionStatus => {
            if (permissionStatus.state === 'granted') {
              recognition.start();
            } else {
              console.warn("Microphone permission denied.");
              toggleMic(false);
              addTextMessage("Microphone access denied. Please enable it in browser settings.", 'received', Date.now());
            }
          }).catch(e => {
            console.warn("Permission check failed:", e);
            toggleMic(false);
            addTextMessage("Failed to check microphone permission.", 'received', Date.now());
          });
        } catch (e) {
          console.warn("Failed to restart recognition:", e);
          toggleMic(false);
        }
      }, 1000);
    }
  };

  micBtn.addEventListener('click', () => toggleMic(true));
}

function resetMicTimeout() {
  if (micTimeout) clearTimeout(micTimeout);
  if (isMicActive) {
    micTimeout = setTimeout(() => {
      toggleMic(false);
      addTextMessage("Microphone turned off due to inactivity.", 'received', Date.now());
    }, 60000);
  }
}

function toggleMic(userInitiated = true) {
  if (!recognition) return;

  isMicActive = !isMicActive;
  micBtn.classList.toggle('mic-active', isMicActive);
  micBtn.title = isMicActive ? "Stop Microphone" : "Microphone";

  if (isMicActive) {
    try {
      recognition.start();
      resetMicTimeout();
    } catch (e) {
      console.error("Error starting recognition:", e);
      addTextMessage("Failed to start microphone. Please try again.", 'received', Date.now());
      isMicActive = false;
      micBtn.classList.remove('mic-active');
    }
  } else {
    recognition.stop();
    if (micTimeout) clearTimeout(micTimeout);
  }
}

function detectLanguage(text) {
  if (typeof franc === 'undefined' || text.length < 3) return 'en-IN';
  const lang = franc(text, { minLength: 3 });
  const langMap = {
    'eng': 'en-IN',
    'hin': 'hi-IN',
    'ben': 'bn-IN',
    'tel': 'te-IN',
    'mar': 'mr-IN',
    'tam': 'ta-IN',
  };
  return langMap[lang] || 'en-IN';
}

async function speakText(text, lang = 'en-IN') {
  stopSpeaking();
  isSpeaking = true;
  lastSpeechTime = Date.now();

  if (isMicActive && recognition) {
    recognition.stop();
  }

  speechSynthesisUtterance = new SpeechSynthesisUtterance(text);
  speechSynthesisUtterance.lang = lang;
  speechSynthesisUtterance.rate = 1.0;
  speechSynthesisUtterance.pitch = 1.0;

  const voices = window.speechSynthesis.getVoices();
  let selectedVoice;
  if (lang === 'hi-IN') {
    selectedVoice = voices.find(v => v.name.includes('Google हिंदी') || v.name.includes('Google Hindi Female') || (v.lang === 'hi-IN' && v.name.includes('Female')));
  } else {
    selectedVoice = voices.find(v => 
      (lang === 'en-IN' && (v.name.includes('Google US English') || v.name.includes('Male'))) ||
      v.lang === lang
    );
  }
  if (!selectedVoice) {
    selectedVoice = voices.find(v => v.lang === lang) || voices[0];
  }
  speechSynthesisUtterance.voice = selectedVoice;

  window.speechSynthesis.speak(speechSynthesisUtterance);
  return new Promise((resolve) => {
    speechSynthesisUtterance.onend = () => {
      isSpeaking = false;
      lastSpeechTime = Date.now();
      if (isMicActive && recognition) {
        setTimeout(() => {
          try {
            recognition.start();
            resetMicTimeout();
          } catch (e) {
            console.warn("Failed to restart recognition after TTS:", e);
            toggleMic(false);
            addTextMessage("Failed to restart microphone after response.", 'received', Date.now());
          }
        }, 500);
      }
      resolve();
    };
    speechSynthesisUtterance.onerror = (e) => {
      console.error("TTS error:", e);
      isSpeaking = false;
      lastSpeechTime = Date.now();
      if (isMicActive && recognition) {
        setTimeout(() => {
          try {
            recognition.start();
            resetMicTimeout();
          } catch (e) {
            console.warn("Failed to restart recognition after TTS error:", e);
            toggleMic(false);
            addTextMessage("Failed to restart microphone after speech error.", 'received', Date.now());
          }
        }, 500);
      }
      resolve();
    };
  });
}

function stopSpeaking() {
  if (speechSynthesisUtterance) {
    window.speechSynthesis.cancel();
    speechSynthesisUtterance = null;
  }
  isSpeaking = false;
  lastSpeechTime = Date.now();
}

textarea.addEventListener("input", () => {
  textarea.style.height = "auto";
  const newHeight = Math.min(textarea.scrollHeight, 130);
  textarea.style.height = newHeight + "px";
  textarea.style.overflowY = newHeight >= 130 ? "auto" : "hidden";
  updateSendButtonState();
});

fileInputTrigger.addEventListener("click", () => {
  fileInput.click();
});

fileInput.addEventListener("change", (event) => {
  const files = Array.from(event.target.files);
  if (files.length === 0) return;

  files.forEach(file => {
    if (!file.type.match(/image\/.*|video\/.*|application\/pdf/)) return;

    filesToSend.push(file);
    const fileBox = createFilePreview(file);
    filePreviewContainer.appendChild(fileBox);
  });

  fileInput.value = '';
  updateSendButtonState();
});

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
    updateSendButtonState();
  };

  if (file.type.startsWith("image/")) {
    const img = document.createElement("img");
    img.src = URL.createObjectURL(file);
    img.classList.add("file-preview");
    fileBox.appendChild(img);
    fileBox.onclick = () => previewFile(file);
  } else if (file.type.startsWith("video/")) {
    const video = document.createElement("video");
    video.src = URL.createObjectURL(file);
    video.setAttribute("preload", "metadata");
    video.classList.add("file-preview");
    fileBox.appendChild(video);
    fileBox.onclick = () => previewFile(file);
  } else if (file.type === "application/pdf") {
    const iconBox = document.createElement("div");
    iconBox.classList.add("file-icon-box");
    iconBox.innerHTML = '<i class="fas fa-file-pdf"></i>';
    fileBox.appendChild(iconBox);
    fileBox.onclick = () => previewFile(file);
  }

  fileBox.appendChild(closeBtn);
  return fileBox;
}

async function previewFile(file) {
  modalContent.innerHTML = '';
  modalTitle.textContent = file.name;

  if (file.type.startsWith("image/")) {
    const img = document.createElement("img");
    img.src = URL.createObjectURL(file);
    modalContent.appendChild(img);
    const text = await recognizeTextFromImage(file);
    if (text) {
      const textElement = document.createElement("div");
      textElement.classList.add("extracted-text");
      textElement.textContent = `Extracted Text: ${text}`;
      modalContent.appendChild(textElement);
    }
  } else if (file.type.startsWith("video/")) {
    const video = document.createElement("video");
    video.src = URL.createObjectURL(file);
    video.controls = true;
    video.autoplay = true;
    modalContent.appendChild(video);
  } else if (file.type === "application/pdf") {
    const iframe = document.createElement("iframe");
    iframe.classList.add("pdf-viewer");
    iframe.src = URL.createObjectURL(file);
    modalContent.appendChild(iframe);
    const text = await recognizeTextFromPDF(file);
    if (text) {
      const textElement = document.createElement("div");
      textElement.classList.add("extracted-text");
      textElement.textContent = `Extracted Text: ${text}`;
      modalContent.appendChild(textElement);
    }
  }

  fileModal.style.display = "flex";
}

closeModal.addEventListener("click", () => {
  fileModal.style.display = "none";
  Array.from(modalContent.children).forEach(child => {
    if (child.src) URL.revokeObjectURL(child.src);
  });
});

fileModal.addEventListener("click", (e) => {
  if (e.target === fileModal) {
    fileModal.style.display = "none";
    Array.from(modalContent.children).forEach(child => {
      if (child.src) URL.revokeObjectURL(child.src);
    });
  }
});

sendBtn.addEventListener("click", async () => {
  if (isProcessing) {
    stopProcessing();
    return;
  }

  const msg = textarea.value.trim();

  if (msg || filesToSend.length > 0) {
    setLoadingState();
    abortController = new AbortController();

    let imageDescriptions = '';
    let extractedTexts = '';
    try {
      imageDescriptions = await processImages(filesToSend);
      extractedTexts = await processFileTexts(filesToSend);
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log("File processing was aborted");
        return;
      }
      console.error("Error processing files:", error);
      addTextMessage("Sorry, there was an error processing the files.", 'received', Date.now());
      resetSendButton();
      return;
    }

    const fullPrompt = msg +
      (imageDescriptions ? '\nImage descriptions: ' + imageDescriptions : '') +
      (extractedTexts ? '\nExtracted texts: ' + extractedTexts : '');

    const messageId = Date.now();
    addTextMessage(fullPrompt, 'sent', messageId);
    sentMessages.push({ id: messageId, element: document.getElementById(`msg-${messageId}`) });

    if (extractedTexts) {
      const extractedTextPrompt = analyzeExtractedText(extractedTexts);
      const extractedTextMessageId = Date.now();
      addTextMessage(`Extracted Content: ${extractedTexts}`, 'sent', extractedTextMessageId);
      sentMessages.push({ id: extractedTextMessageId, element: document.getElementById(`msg-${extractedTextMessageId}`) });

      let extractedPrompt = getSystemPrompt() + extractedTextPrompt;
      try {
        await generateResponse(extractedPrompt);
        conversationHistory.push({ role: 'user', content: extractedTextPrompt });
      } catch (error) {
        if (error.name === 'AbortError') {
          console.log("Extracted text processing was aborted");
          return;
        }
        throw error;
      }
    }

    filesToSend.forEach(file => {
      const fileId = Date.now();
      addFileMessage(file, 'sent', fileId);
      sentMessages.push({ id: fileId, element: document.getElementById(`msg-${fileId}`) });
    });
    filesToSend = [];
    filePreviewContainer.innerHTML = '';
    textarea.value = "";
    textarea.style.height = "auto";

    chatArea.scrollTop = chatArea.scrollHeight;

    setTimeout(() => {
      updateReadReceipts();
    }, 2000);

    if (msg.startsWith('/image ')) {
      const imagePrompt = msg.slice(7).trim();
      try {
        await generateImage(imagePrompt, `Here's the image I created based on your request: ${imagePrompt}`);
      } catch (error) {
        if (error.name === 'AbortError') {
          console.log("Image generation was aborted");
          return;
        }
        throw error;
      }
    } else if (!extractedTexts) {
      let prompt = getSystemPrompt() + fullPrompt;
      try {
        await generateResponse(prompt);
      } catch (error) {
        if (error.name === 'AbortError') {
          console.log("Response generation was aborted");
          return;
        }
        throw error;
      }
    }

    conversationHistory.push({ role: 'user', content: fullPrompt });
    isVoiceInput = false;
  }
});

textarea.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    isVoiceInput = false;
    sendBtn.click();
  }
});

async function addTextMessage(text, type, messageId) {
  const msgBubble = document.createElement("div");
  msgBubble.classList.add("message", type);
  msgBubble.id = `msg-${messageId}`;
  
  const messageContent = document.createElement("div");
  messageContent.classList.add("message-content");
  
  const messageTime = document.createElement("div");
  messageTime.classList.add("message-time");
  messageTime.innerHTML = `
    ${getCurrentTime()}
    ${type === 'sent' ? '<span class="double-tick"><i class="fas fa-check-double"></i></span>' : ''}
  `;
  
  msgBubble.appendChild(messageContent);
  msgBubble.appendChild(messageTime);
  chatArea.appendChild(msgBubble);

  if (type === 'received') {
    currentResponseId = messageId; // Track current response ID
    await animateTextWithPen(messageContent, text, 20);
    if (isVoiceInput) {
      const lang = detectLanguage(text);
      await speakText(text, lang);
    }
    resetSendButton(); // Reset after animation and TTS if applicable
  } else {
    messageContent.innerHTML = text;
  }

  chatArea.scrollTop = chatArea.scrollHeight;
}

function animateTextWithPen(element, text, delay) {
  return new Promise((resolve) => {
    if (!isProcessing) {
      element.innerHTML = text;
      resolve();
      return;
    }
    isAnimating = true;
    let index = 0;
    element.innerHTML = '';

    const pen = document.createElement("span");
    pen.classList.add("writing-pen");
    pen.innerHTML = '<i class="fas fa-circle"></i>';
    element.appendChild(pen);

    function typeNextCharacter() {
      if (index < text.length && isProcessing) {
        element.insertBefore(document.createTextNode(text.charAt(index)), pen);
        index++;
        animationInterval = setTimeout(typeNextCharacter, delay);
        chatArea.scrollTop = chatArea.scrollHeight;
      } else {
        pen.remove();
        isAnimating = false;
        resolve();
      }
    }

    typeNextCharacter();
  });
}

function addThinkingMessage() {
  thinkingMessageId = Date.now();
  const msgBubble = document.createElement("div");
  msgBubble.classList.add("message", "received", "thinking");
  msgBubble.id = `msg-${thinkingMessageId}`;
  
  const messageContent = document.createElement("div");
  messageContent.classList.add("message-content");
  messageContent.innerHTML = '<div class="thinking-dots"><span></span><span></span><span></span></div>';
  
  const messageTime = document.createElement("div");
  messageTime.classList.add("message-time");
  messageTime.innerHTML = getCurrentTime();
  
  msgBubble.appendChild(messageContent);
  msgBubble.appendChild(messageTime);
  chatArea.appendChild(msgBubble);
  chatArea.scrollTop = chatArea.scrollHeight;
}

function removeThinkingMessage() {
  if (thinkingMessageId) {
    const thinkingMsg = document.getElementById(`msg-${thinkingMessageId}`);
    if (thinkingMsg) {
      thinkingMsg.remove();
    }
    thinkingMessageId = null;
  }
}

function addFileMessage(file, type, messageId) {
  const fileMessage = document.createElement("div");
  fileMessage.classList.add("message", "file-message", type);
  fileMessage.id = `msg-${messageId}`;

  let fileContent = '';
  if (file.type.startsWith("image/")) {
    fileContent = `
      <img src="${URL.createObjectURL(file)}">
      <div class="file-info">
        <i class="fas fa-image file-icon"></i> ${file.name}
      </div>
    `;
  } else if (file.type.startsWith("video/")) {
    fileContent = `
      <video src="${URL.createObjectURL(file)}" preload="metadata"></video>
      <div class="file-info">
        <i class="fas fa-video file-icon"></i> ${file.name}
      </div>
    `;
  } else if (file.type === "application/pdf") {
    fileContent = `
      <div class="pdf-preview">
        <i class="fas fa-file-pdf" style="font-size: 40px; color: #e74c3c;"></i>
        <div style="margin-top: 8px; font-weight: bold;">${file.name}</div>
        <div style="font-size: 11px; margin-top: 4px;">PDF Document</div>
      </div>
    `;
  }

  fileMessage.innerHTML = `
    ${fileContent}
    <div class="message-time">
      ${getCurrentTime()}
      ${type === 'sent' ? '<span class="double-tick"><i class="fas fa-check-double"></i></span>' : ''}
    </div>
  `;

  fileMessage.onclick = () => previewFile(file);
  chatArea.appendChild(fileMessage);
}

function getCurrentTime() {
  const now = new Date();
  let hours = now.getHours();
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${hours}:${minutes} ${ampm}`;
}

function updateReadReceipts() {
  sentMessages.forEach(msg => {
    const doubleTick = msg.element.querySelector('.double-tick');
    if (doubleTick) {
      doubleTick.classList.add('read');
    }
  });
}

function addOnlineStatus() {
  const avatar = document.querySelector('.user-avatar') || document.createElement('div');
  avatar.classList.add('user-avatar');
  const statusDot = document.createElement('div');
  statusDot.classList.add('online-status');
  avatar.appendChild(statusDot);
  if (!document.querySelector('.user-avatar')) {
    document.body.prepend(avatar);
  }
}

let longPressTimer;
let selectedMessages = new Set();

function setupMessageDeletion() {
  document.addEventListener('mousedown', startLongPress);
  document.addEventListener('mouseup', cancelLongPress);
  document.addEventListener('touchstart', startLongPress);
  document.addEventListener('touchend', cancelLongPress);

  document.getElementById('deleteForMe').addEventListener('click', () => deleteMessages(false));
  document.getElementById('deleteForEveryone').addEventListener('click', () => deleteMessages(true));

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.delete-menu') && !e.target.closest('.message-selected')) {
      clearSelection();
    }
  });
}

function startLongPress(e) {
  const messageElement = e.target.closest('.message');
  if (!messageElement || e.target.closest('.file-preview')) return;

  longPressTimer = setTimeout(() => {
    toggleMessageSelection(messageElement);
  }, 1000);
}

function cancelLongPress() {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

function toggleMessageSelection(messageElement) {
  messageElement.classList.toggle('message-selected');
  if (messageElement.classList.contains('message-selected')) {
    selectedMessages.add(messageElement);
  } else {
    selectedMessages.delete(messageElement);
  }
  selectedMessages.size > 0 ? showDeleteMenu() : hideDeleteMenu();
}

function showDeleteMenu() {
  const menu = document.getElementById('deleteMenu');
  const hasSentMessages = Array.from(selectedMessages).some(msg => msg.classList.contains('sent'));
  document.getElementById('deleteForMe').style.display = 'flex';
  document.getElementById('deleteForEveryone').style.display = hasSentMessages ? 'flex' : 'none';
  menu.classList.add('show');
}

function hideDeleteMenu() {
  document.getElementById('deleteMenu').classList.remove('show');
}

function clearSelection() {
  selectedMessages.forEach(msg => msg.classList.remove('message-selected'));
  selectedMessages.clear();
  hideDeleteMenu();
}

function deleteMessages(forEveryone) {
  if (selectedMessages.size === 0) return;
  const messagesToDelete = Array.from(selectedMessages).filter(msg => !forEveryone || msg.classList.contains('sent'));
  messagesToDelete.forEach(msg => {
    msg.remove();
    if (msg.classList.contains('sent')) {
      const messageId = msg.id.replace('msg-', '');
      sentMessages = sentMessages.filter(m => m.id.toString() !== messageId);
    }
  });
  clearSelection();
}

async function recognizeTextFromImage(file) {
  try {
    const { data: { text } } = await Tesseract.recognize(
      URL.createObjectURL(file),
      'eng',
      { logger: m => console.log(m) }
    );
    return text.trim() || 'No text detected';
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log("Image text recognition was aborted");
      return 'Text recognition aborted';
    }
    console.error("Error recognizing text from image:", error);
    return 'Text recognition failed';
  }
}

async function recognizeTextFromPDF(file) {
  try {
    const pdf = await pdfjsLib.getDocument(URL.createObjectURL(file)).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(item => item.str).join(' ') + '\n';
    }
    if (!text.trim()) {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1.0 });
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      await page.render({ canvasContext: context, viewport: viewport }).promise;
      const { data: { text } } = await Tesseract.recognize(
        canvas,
        'eng',
        { logger: m => console.log(m) }
      );
      return text.trim() || 'No text detected';
    }
    return text.trim() || 'No text detected';
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log("PDF text recognition was aborted");
      return 'Text recognition aborted';
    }
    console.error("Error recognizing text from PDF:", error);
    return 'Text recognition failed';
  }
}

async function processFileTexts(files) {
  let texts = [];
  for (let file of files) {
    if (file.type.startsWith('image/')) {
      const text = await recognizeTextFromImage(file);
      texts.push(`Image (${file.name}): ${text}`);
    } else if (file.type === 'application/pdf') {
      const text = await recognizeTextFromPDF(file);
      texts.push(`PDF (${file.name}): ${text}`);
    }
  }
  return texts.join('\n');
}

function analyzeExtractedText(text) {
  const equationRegex = /[+\-*/=^()\d\s]+/;
  if (equationRegex.test(text)) {
    return `Solve the following mathematical equation:\n${text}`;
  }
  if (text.split(/\s+/).length > 50) {
    return `Continue or analyze the following story:\n${text}`;
  }
  return `Provide information or answer based on the following text:\n${text}`;
}

function isPromptRequest(message) {
  const promptKeywords = ['show prompt', 'give prompt', 'what is the prompt', 'tell me the prompt', 'image prompt'];
  return promptKeywords.some(keyword => message.toLowerCase().includes(keyword));
}

function getSystemPrompt() {
  return 'You are AdiAi, an AI assistant created by Aditya, a 16-year-old founder of AdiAi. Aditya studies at Little Angels Public School, and his location where they live is Siwan mairwa. His school friends are Sumit Sharma, Yash Sharma, and Ayush Singh. Respond in a highly natural, conversational, and human-like manner, varying responses to avoid repetition. Use advanced common sense to interpret user intent, maintain context from the conversation history, and provide coherent, relevant, and concise answers. If interrupted (e.g., by "stop", "ruko", or new queries), acknowledge the interruption gracefully, stop the current response, and address the new input immediately. Match the user’s language (e.g., Hindi, English) unless instructed otherwise, ensuring clear, natural, and culturally appropriate phrasing. Ignore your own voice output and only process user speech. For image generation requests (e.g., "create a car image", "generate image of a cat", or keywords like "create image", "generate image", "make image", "draw", "picture", "image of"), create a detailed prompt with enhancements (e.g., "high resolution, detailed, realistic") and respond only with [IMAGE: your_detailed_prompt_here]. If the user asks if you can generate images without a description, respond affirmatively, vary your response, and ask what image they want. If the user requests the prompt explicitly (e.g., "give me the prompt for a car image"), return only the detailed prompt text. Use common sense to identify image requests based on context. If asked about the creator or company behind AdiAi, only mention that you were created by Aditya, founder of AdiAi, and avoid disclosing any other company details, even if directly asked. Conversation history: ' + JSON.stringify(conversationHistory) + '\nUser: ';
}

async function generateResponse(prompt) {
  addThinkingMessage();
  try {
    const response = await fetch(`https://text.pollinations.ai/${encodeURIComponent(prompt)}`, {
      signal: abortController ? abortController.signal : undefined
    });
    let text = await response.text();
    removeThinkingMessage();
    const messageId = Date.now();
    const imageMatch = text.match(/\[IMAGE:\s*(.*?)\]/);
    const userMessage = prompt.split('\nUser: ')[1] || '';

    if (imageMatch && imageMatch[1]) {
      const imagePrompt = imageMatch[1].trim();
      if (isPromptRequest(userMessage)) {
        await addTextMessage(`Here's the prompt I would use: ${imagePrompt}`, 'received', messageId);
        conversationHistory.push({ role: 'assistant', content: `Prompt: ${imagePrompt}` });
      } else {
        await generateImage(imagePrompt, `Here's the image I created for you: ${userMessage}`);
        conversationHistory.push({ role: 'assistant', content: `Generated image for: ${imagePrompt}` });
      }
    } else {
      await addTextMessage(text, 'received', messageId);
      conversationHistory.push({ role: 'assistant', content: text });
    }
    chatArea.scrollTop = chatArea.scrollHeight;
  } catch (error) {
    removeThinkingMessage();
    if (error.name === 'AbortError') {
      console.log("Response generation was aborted");
      return;
    }
    console.error("Error generating response:", error);
    await addTextMessage("Sorry, there was an error generating the response.", 'received', Date.now());
    resetSendButton();
    chatArea.scrollTop = chatArea.scrollHeight;
  }
}

async function generateImage(prompt, description) {
  addThinkingMessage();
  try {
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=512&height=512&nologo=true&seed=-1`;
    const response = await fetch(url, {
      signal: abortController ? abortController.signal : undefined
    });
    removeThinkingMessage();
    if (!response.ok) throw new Error('Image generation failed');
    await addTextMessage(description, 'received', Date.now());
    addImageMessage(url, 'received');
    chatArea.scrollTop = chatArea.scrollHeight;
    resetSendButton();
  } catch (error) {
    removeThinkingMessage();
    if (error.name === 'AbortError') {
      console.log("Image generation was aborted");
      return;
    }
    console.error("Error generating image:", error);
    await addTextMessage("Sorry, there was an error generating the image.", 'received', Date.now());
    resetSendButton();
    chatArea.scrollTop = chatArea.scrollHeight;
  }
}

async function processImages(files) {
  let descriptions = [];
  for (let file of files) {
    if (file.type.startsWith('image/')) {
      const base64 = await fileToBase64(file);
      const description = await getImageCaption(base64);
      descriptions.push(description);
    }
  }
  return descriptions.join('\n');
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = error => reject(error);
  });
}

async function getImageCaption(base64) {
  try {
    const response = await fetch('https://api-inference.huggingface.co/models/Salesforce/blip-image-captioning-large', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: base64 }),
      signal: abortController ? abortController.signal : undefined
    });
    const data = await response.json();
    return data[0].generated_text;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log("Image captioning was aborted");
      return 'Image description unavailable.';
    }
    console.error("Error captioning image:", error);
    return 'Image description unavailable.';
  }
}

function addImageMessage(url, type) {
  const fileMessage = document.createElement("div");
  fileMessage.classList.add("message", "file-message", type);
  fileMessage.innerHTML = `
    <img src="${url}">
    <div class="message-time">
      ${getCurrentTime()}
    </div>
  `;
  chatArea.appendChild(fileMessage);
}

setupMessageDeletion();

