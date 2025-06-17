// chatbot_core.js

const CHAT_STORAGE_KEY = "chatbot-history-v1";

// Add message to chat, UI needs a container id
function addMessage(text, sender, containerId, save = true) {
  const chatMessages = document.getElementById(containerId);
  const msgRow = document.createElement('div');
  msgRow.className = 'message-row ' + sender;

  const img = document.createElement('img');
  img.className = 'profile-pic';
  img.src = sender === "self"
    ? (typeof USER_PROFILE_PIC !== "undefined" ? USER_PROFILE_PIC : "/static/images/self.png")
    : "/static/images/chatbot.png";
  img.alt = sender === "self" ? "You" : "Assistant";

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';
  bubble.textContent = text;

  if (sender === "self") {
    msgRow.appendChild(bubble);
    msgRow.appendChild(img);
  } else {
    msgRow.appendChild(img);
    msgRow.appendChild(bubble);
  }
  chatMessages.appendChild(msgRow);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  if (save) saveChatHistory(containerId);
}

// Save chat history to localStorage
function saveChatHistory(containerId) {
  const chatMessages = document.getElementById(containerId);
  const msgs = [];
  chatMessages.querySelectorAll('.message-row').forEach(row => {
    const sender = row.classList.contains('self') ? 'self' : 'assistant';
    const text = row.querySelector('.chat-bubble').textContent;
    msgs.push({ sender, text });
  });
  localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(msgs));
}

// Restore chat history from localStorage
function restoreChatHistory(containerId) {
  const chatMessages = document.getElementById(containerId);
  chatMessages.innerHTML = "";
  const msgs = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) || "[]");
  msgs.forEach(m => addMessage(m.text, m.sender, containerId, false));
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Clear chat history
function clearChatHistory(containerId) {
  document.getElementById(containerId).innerHTML = "";
  localStorage.removeItem(CHAT_STORAGE_KEY);
}

// Listen for changes in localStorage (sync tabs/windows/widgets)
window.addEventListener('storage', function (event) {
  if (event.key === CHAT_STORAGE_KEY) {
    if (window.updateAllChatUIs) window.updateAllChatUIs();
  }
});
