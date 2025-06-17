// chatbot_widget.js

const WIDGET_CONTAINER_ID = "chatbot-messages-widget";
const FLOAT_BTN_ID = "chatbot-float-btn";
const WINDOW_ID = "chatbot-window";
const CLOSE_BTN_CLASS = "draggable-close";
const CLEAR_BTN_CLASS = "clear-chat-btn-widget";
const INPUT_FORM_ID = "chatbot-input-area-widget";
const INPUT_BOX_ID = "widget-msg";

// --- Drag logic, snap to edge, open/close ---
(function() {
  const btn = document.getElementById(FLOAT_BTN_ID);
  const win = document.getElementById(WINDOW_ID);
  const minGap = 24;
  let dragging = false, offsetX = 0, offsetY = 0, movedDuringDrag = false;
  // Clamp helper
  function clamp(val, min, max) { return Math.max(min, Math.min(val, max)); }
  function snapToEdge(x, y) {
    const btnW = btn.offsetWidth, btnH = btn.offsetHeight;
    const viewportW = window.innerWidth, viewportH = window.innerHeight;
    const dLeft = x, dRight = viewportW - (x + btnW),
      dTop = y, dBottom = viewportH - (y + btnH);
    const minDist = Math.min(dLeft, dRight, dTop, dBottom);
    let edge;
    if (minDist === dLeft) edge = 'left';
    else if (minDist === dRight) edge = 'right';
    else if (minDist === dTop) edge = 'top';
    else edge = 'bottom';
    let finalX = x, finalY = y;
    if (edge === 'left' || edge === 'right') {
      finalY = clamp(y, minGap, viewportH - btnH - minGap);
      finalX = (edge === 'left') ? minGap : viewportW - btnW - minGap;
    } else {
      finalX = clamp(x, minGap, viewportW - btnW - minGap);
      finalY = (edge === 'top') ? minGap : viewportH - btnH - minGap;
    }
    return { edge, finalX, finalY };
  }
  function setBtnPos(edge, x, y) {
    btn.style.left = ''; btn.style.right = ''; btn.style.top = ''; btn.style.bottom = '';
    if (edge === 'left')      { btn.style.left = minGap + 'px'; btn.style.top = y + 'px'; }
    else if (edge === 'right'){ btn.style.right = minGap + 'px'; btn.style.top = y + 'px'; }
    else if (edge === 'top')  { btn.style.top = minGap + 'px'; btn.style.left = x + 'px'; }
    else if (edge === 'bottom'){btn.style.bottom = minGap + 'px'; btn.style.left = x + 'px'; }
  }
  function setWinPos(edge, x, y) {
    win.style.left = ''; win.style.right = ''; win.style.top = ''; win.style.bottom = '';
    const w = win.offsetWidth, h = win.offsetHeight;
    const btnW = btn.offsetWidth, btnH = btn.offsetHeight;
    if (edge === 'left') {
      win.style.left = (minGap * 2 + btnW) + 'px';
      win.style.top = y + 'px';
      if (parseInt(win.style.top) + h > window.innerHeight - minGap)
        win.style.top = (window.innerHeight - h - minGap) + 'px';
    } else if (edge === 'right') {
      win.style.right = (minGap * 2 + btnW) + 'px';
      win.style.top = y + 'px';
      if (parseInt(win.style.top) + h > window.innerHeight - minGap)
        win.style.top = (window.innerHeight - h - minGap) + 'px';
    } else if (edge === 'top') {
      win.style.top = (minGap * 2 + btnH) + 'px';
      win.style.left = x + 'px';
      if (parseInt(win.style.left) + w > window.innerWidth - minGap)
        win.style.left = (window.innerWidth - w - minGap) + 'px';
    } else if (edge === 'bottom') {
      win.style.bottom = (minGap * 2 + btnH) + 'px';
      win.style.left = x + 'px';
      if (parseInt(win.style.left) + w > window.innerWidth - minGap)
        win.style.left = (window.innerWidth - w - minGap) + 'px';
    }
  }

  // Drag events
  btn.addEventListener('mousedown', (e) => {
    dragging = true; movedDuringDrag = false;
    offsetX = e.clientX - btn.getBoundingClientRect().left;
    offsetY = e.clientY - btn.getBoundingClientRect().top;
    document.body.style.userSelect = "none";
  });
  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    movedDuringDrag = true;
    let x = e.clientX - offsetX;
    let y = e.clientY - offsetY;
    x = clamp(x, minGap, window.innerWidth - btn.offsetWidth - minGap);
    y = clamp(y, minGap, window.innerHeight - btn.offsetHeight - minGap);
    btn.style.left = x + "px"; btn.style.top = y + "px";
    btn.style.right = ""; btn.style.bottom = "";
  });
  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false; document.body.style.userSelect = "";
    let x = btn.getBoundingClientRect().left, y = btn.getBoundingClientRect().top;
    const { edge, finalX, finalY } = snapToEdge(x, y);
    setBtnPos(edge, finalX, finalY);
    setWinPos(edge, finalX, finalY);
  });

  // Button click to open/close widget
  let widgetOpen = false;
  function toggleChatbotWindow() {
    widgetOpen = !widgetOpen;
    win.style.display = widgetOpen ? "flex" : "none";
    if (widgetOpen) {
      // Align window to snapped edge/position of button
      let btnRect = btn.getBoundingClientRect();
      let { edge, finalX, finalY } = snapToEdge(btnRect.left, btnRect.top);
      setWinPos(edge, finalX, finalY);
      // Focus input
      setTimeout(() => document.getElementById(INPUT_BOX_ID).focus(), 100);
    }
  }
  btn.addEventListener('click', function(e) {
    if (movedDuringDrag) { movedDuringDrag = false; return; }
    toggleChatbotWindow();
  });
  // Also close with the [X] close button
  win.querySelector("." + CLOSE_BTN_CLASS).onclick = () => { toggleChatbotWindow(); };

  // Initial positions (bottom right)
  setBtnPos('right', window.innerWidth - btn.offsetWidth - minGap, window.innerHeight - btn.offsetHeight - minGap);
  setWinPos('right', window.innerWidth - btn.offsetWidth - minGap, window.innerHeight - btn.offsetHeight - minGap);
})();

// -- Chatbot logic (reuse core logic, but connect widget UI) --

function updateAllChatUIs() {
  // Called by core when localStorage changes
  restoreChatHistory(WIDGET_CONTAINER_ID);
}
window.updateAllChatUIs = updateAllChatUIs;

function confirmClearChat() {
  if (window.confirm("Are you sure you want to clear all chat history? This cannot be undone.")) {
    clearChatHistory(WIDGET_CONTAINER_ID);
  }
}

// On load: restore messages, set up UI events
window.addEventListener("DOMContentLoaded", function() {
  restoreChatHistory(WIDGET_CONTAINER_ID);

  // Send on form submit
  document.getElementById(INPUT_FORM_ID).onsubmit = function(e) {
    e.preventDefault();
    const input = document.getElementById(INPUT_BOX_ID);
    const msg = input.value.trim();
    if (msg.length) {
      addMessage(msg, "self", WIDGET_CONTAINER_ID);
      input.value = '';
      // Fetch reply from server
      addMessage("...", "assistant", WIDGET_CONTAINER_ID, false);
      fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg })
      })
      .then(response => response.json())
      .then(data => {
        const container = document.getElementById(WIDGET_CONTAINER_ID);
        // Remove the "..." message
        if (container.lastChild && container.lastChild.classList.contains('assistant') &&
            container.lastChild.querySelector('.chat-bubble').textContent === "...") {
          container.removeChild(container.lastChild);
        }
        addMessage(data.reply, "assistant", WIDGET_CONTAINER_ID);
      })
      .catch(error => {
        const container = document.getElementById(WIDGET_CONTAINER_ID);
        if (container.lastChild && container.lastChild.classList.contains('assistant') &&
            container.lastChild.querySelector('.chat-bubble').textContent === "...") {
          container.removeChild(container.lastChild);
        }
        addMessage("[Error contacting assistant. Try again later.]", "assistant", WIDGET_CONTAINER_ID);
        console.error(error);
      });
    }
    return false;
  };

  // Clear button
  document.querySelector('.' + CLEAR_BTN_CLASS).onclick = confirmClearChat;
});

