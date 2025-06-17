const MAIN_CONTAINER_ID = "chat-messages";
const INPUT_FORM_ID = "chat-input-form";
const INPUT_BOX_ID = "msg";

function confirmClearChat() {
  if (window.confirm("Are you sure you want to clear all chat history? This cannot be undone.")) {
    clearChatHistory(MAIN_CONTAINER_ID);
  }
}

function updateAllChatUIs() {
  restoreChatHistory(MAIN_CONTAINER_ID);
}
window.updateAllChatUIs = updateAllChatUIs;

window.addEventListener("DOMContentLoaded", function() {
  restoreChatHistory(MAIN_CONTAINER_ID);

  if (!localStorage.getItem("chatbot-history-v1") ||
      document.getElementById(MAIN_CONTAINER_ID).innerHTML.trim() === "") {
    addMessage(
      "Welcome! I am your Sibu Tourism Guide Assistant. Ask about any place, food, or activity in Sibu.",
      "assistant",
      MAIN_CONTAINER_ID
    );
  }
  document.getElementById(INPUT_BOX_ID).focus();

  document.getElementById(INPUT_FORM_ID).onsubmit = function(e) {
    e.preventDefault();
    const input = document.getElementById(INPUT_BOX_ID);
    const msg = input.value.trim();
    if (msg.length) {
      addMessage(msg, "self", MAIN_CONTAINER_ID);
      input.value = '';
      addMessage("...", "assistant", MAIN_CONTAINER_ID, false);
      fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg })
      })
      .then(response => response.json())
      .then(data => {
        const container = document.getElementById(MAIN_CONTAINER_ID);
        if (container.lastChild && container.lastChild.classList.contains('assistant') &&
            container.lastChild.querySelector('.chat-bubble').textContent === "...") {
          container.removeChild(container.lastChild);
        }
        addMessage(data.reply, "assistant", MAIN_CONTAINER_ID);
      })
      .catch(error => {
        const container = document.getElementById(MAIN_CONTAINER_ID);
        if (container.lastChild && container.lastChild.classList.contains('assistant') &&
            container.lastChild.querySelector('.chat-bubble').textContent === "...") {
          container.removeChild(container.lastChild);
        }
        addMessage("[Error contacting assistant. Try again later.]", "assistant", MAIN_CONTAINER_ID);
        console.error(error);
      });
    }
    return false;
  };
});
