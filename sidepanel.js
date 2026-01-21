// 1. SETUP & VARIABLES
const apiKeyInput = document.getElementById('apiKey');
const saveBtn = document.getElementById('saveKey');
const statusDiv = document.getElementById('status');
const auditBtn = document.getElementById('auditBtn');
const autoFillBtn = document.getElementById('autoFillBtn');
const output = document.getElementById('output');
const autoModeCheckbox = document.getElementById('autoMode');

// GLOBAL STATE
let activeTimer = null;
let activeTabs = [];
let currentAnswers = {}; 
let currentMerchantUrl = "";

// 2. LOAD KEY ON STARTUP
document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(['geminiKey'], (result) => {
    if (result.geminiKey) {
      apiKeyInput.value = result.geminiKey;
      statusDiv.innerHTML = "✅ Key loaded. Ready to Audit.";
    }
  });
});

// 3. SAVE FUNCTION
if (saveBtn) {
  saveBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (!key) {
      statusDiv.textContent = "❌ Please enter a key first.";
      return;
    }
    chrome.storage.local.set({ geminiKey: key }, () => {
      statusDiv.innerHTML = "✅ Key Saved!";
      setTimeout(() => { statusDiv.textContent = "Ready."; }, 2000);
    });
  });
}

// Helper: Consistent Status Updater
function updateStatus(message, color = "#fff") {
    const host = currentMerchantUrl ? new URL(currentMerchantUrl).hostname : "Unknown";
    statusDiv.innerHTML = `
        <div style="font-size:11px; color:#aaa; margin-bottom:5px;">TARGET: <b>${host}</b></div>
        <div style="color:${color}">${message}</div>
    `;
}

// 4. MAIN AUDIT FUNCTION
async function startAudit() {
  if (activeTimer) clearInterval(activeTimer);
  if (activeTabs.length > 0) {
    activeTabs.forEach(id => chrome.tabs.remove(id, () => { if (chrome.runtime.lastError) {} }));
    activeTabs = [];
  }
  
  autoFillBtn.style.display = 'none'; 
  output.textContent = "🚀 Starting Audit Workflow...";
  output.classList.remove('error');
  auditBtn.disabled = true;
  auditBtn.textContent = "Running...";

  const storage = await chrome.storage.local.get(['geminiKey']);
  if (!storage.geminiKey) {
    output.textContent = "❌ No API Key found.";
    auditBtn.disabled = false;
    return;
  }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // --- STEP A: TIMER (4-5 Minutes per Guidelines) ---
    const minTime = 240; 
    const maxTime = 300;
    const duration = Math.floor(Math.random() * (maxTime - minTime + 1) + minTime);
    const startTime = Date.now();
    
    // --- STEP B: FIND URL ---
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: () => {
        const links = Array.from(document.querySelectorAll('a'));
        let target = links.find(a => a.parentElement?.innerText?.includes("Merchant:"));
        if (!target) target = links.find(a => !a.href.includes("google") && !a.href.includes("labelbox") && a.href.startsWith("http"));
        return target ? target.href : null;
      }
    });

    const foundFrame = results.find(r => r.result);
    if (!foundFrame || !foundFrame.result) throw new Error("Could not find Merchant URL.");
    currentMerchantUrl = foundFrame.result;
    
    // --- STEP C: START SIMULATION ---
    simulateHumanActivity(currentMerchantUrl, duration);
    
    // --- STEP D: CHECK LIVE STATUS ---
    updateStatus("👀 Checking for Dead Links...", "#fdd835");
    const liveStatus = await checkLiveStatus(currentMerchantUrl);
    
    // --- STEP E: GEMINI ANALYSIS ---
    updateStatus("🧠 Gemini is Thinking...", "#8ab4f8");
    const answer = await callGeminiWithRetry(storage.geminiKey, currentMerchantUrl, liveStatus);
    output.innerHTML = answer.displayHtml;

    // --- STEP F: PARSE & FILL ---
    currentAnswers = parseAnswersFromText(answer.rawText);
    const count = Object.keys(currentAnswers).length;
    
    if (count > 0) {
      updateStatus(`✍️ Auto-Filling ${count} Answers...`, "#c58af9");
      
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: clickLabelBoxRadioButtons,
        args: [currentAnswers]
      });

      // --- AUTONOMOUS MODE HANDLER ---
      if (autoModeCheckbox.checked) {
        const elapsed = (Date.now() - startTime) / 1000;
        const remaining = duration - elapsed;
        
        if (remaining > 0) {
            const waitEnd = Date.now() + (remaining * 1000);
            while (Date.now() < waitEnd) {
                if (!autoModeCheckbox.checked) {
                    updateStatus("🛑 Auto-Submit cancelled.", "#ff8a80");
                    auditBtn.disabled = false;
                    auditBtn.textContent = "Start Next Audit 🚀";
                    return;
                }
                const secLeft = Math.floor((waitEnd - Date.now()) / 1000);
                updateStatus(`⏳ Waiting for timer (${secLeft}s)...`, "#fdd835");
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        updateStatus("✅ Submitting...", "#81c995");
        
        const submitted = await chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: true },
          func: clickSubmitButton
        });

        if (submitted && submitted[0] && submitted[0].result === "CLICKED") {
           updateStatus("✅ Submitted! Next task in 8s...", "#81c995");
           auditBtn.textContent = "Waiting for next task...";
           setTimeout(startAudit, 8000); 
           return; 
        } else {
           updateStatus("⚠️ Submit button missed. Stopping.", "#ff8a80");
           auditBtn.disabled = false;
           auditBtn.textContent = "Try Again";
        }
      } else {
         autoFillBtn.style.display = 'block'; 
         autoFillBtn.textContent = `✨ Re-Fill (${count} Answers)`;
         auditBtn.disabled = false;
         auditBtn.textContent = "Start Next Audit 🚀";
      }
    } else {
      console.log("No answers parsed.");
      auditBtn.disabled = false;
    }

  } catch (err) {
    output.textContent = "Error: " + err.message;
    output.classList.add('error');
    auditBtn.disabled = false;
    auditBtn.textContent = "Try Again";
  }
}

if (auditBtn) auditBtn.addEventListener('click', startAudit);

if (autoFillBtn) {
  autoFillBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: clickLabelBoxRadioButtons,
      args: [currentAnswers]
    });
    autoFillBtn.textContent = "✅ Filled!";
  });
}

// --- HELPER: CLICK SUBMIT BUTTON ---
function clickSubmitButton() {
  const btn = document.querySelector('button[data-cy="submit-label-btn"]');
  if (btn && !btn.disabled) {
    btn.click();
    return "CLICKED";
  }
  const allBtns = Array.from(document.querySelectorAll('button'));
  const submitBtn = allBtns.find(b => b.innerText.trim().toUpperCase() === "SUBMIT");
  if (submitBtn && !submitBtn.disabled) {
      submitBtn.click();
      return "CLICKED";
  }
  return "NOT_FOUND";
}

// --- HELPER: CHECK LIVE STATUS ---
async function checkLiveStatus(url) {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 6000); 

    // 1. PING (No-CORS)
    try {
        await fetch(url, { method: 'HEAD', mode: 'no-cors', signal: controller.signal });
    } catch (networkErr) {
        clearTimeout(id);
        return "DEAD_STORE"; 
    }

    // 2. CONTENT CHECK
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    clearTimeout(id);
    
    const cleanText = text.toLowerCase().replace(/\s+/g, ' ');
    const deadPhrases = [
        "sorry, this store is currently unavailable",
        "this store is currently unavailable", 
        "this shop is currently unavailable",
        "opening soon",
        "will be opening soon",
        "enter store using password",
        "please enter your password",
        "be the first to know when we launch"
    ];

    for (const phrase of deadPhrases) {
        if (cleanText.includes(phrase)) {
            if (phrase === "opening soon" && cleanText.includes("add to cart")) continue;
            return "DEAD_STORE";
        }
    }
    return "LIKELY_LIVE";
    
  } catch (e) { 
    return "LIKELY_LIVE"; 
  }
}

// --- HELPER: API RETRY ---
async function callGeminiWithRetry(apiKey, targetUrl, liveStatus, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const result = await callGemini(apiKey, targetUrl, liveStatus);
      if (result.rawText && result.rawText !== "Error") return result;
      throw new Error("Empty response");
    } catch (e) {
      if (i === retries) throw e;
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

// --- HELPER: PARSE ANSWERS ---
function parseAnswersFromText(text) {
  const map = {};
  const lines = text.split('\n');
  lines.forEach(line => {
    const match = line.match(/(\d+)\.\s*Q\d+.*Option:\s*([a-c]\.\s*)?(.*)/i);
    if (match) {
      const index = match[1]; 
      let answerText = match[3].trim(); 
      answerText = answerText.replace(/^"/, "").replace(/"$/, "");
      answerText = answerText.split('(')[0].trim();
      if (answerText.length >= 2) map[index] = answerText;
    }
  });
  return map;
}

// --- HELPER: ROBUST CLICKER ---
async function clickLabelBoxRadioButtons(answersMap) {
  for (const idx of Object.keys(answersMap)) {
    let targetText = answersMap[idx].toLowerCase();
    
    // MATCHING LOGIC
    const isNotSure = targetText.includes("not sure");
    const isShortAnswer = targetText.length < 5;
    const searchString = targetText.substring(0, 25);
    
    let clicked = false;

    const attemptClick = (radioElement, source) => {
        if (radioElement && !radioElement.checked) { 
            radioElement.click();
            radioElement.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        } else if (radioElement && radioElement.checked) {
            return true;
        }
        return false;
    };

    // Scoped Search
    const numberBadge = document.querySelector(`span[title="${idx}"]`);
    if (numberBadge) {
      const container = numberBadge.closest('.classification-container');
      if (container) {
        const allPTags = Array.from(container.querySelectorAll('p'));
        const targetP = allPTags.find(p => {
            const pText = p.innerText.toLowerCase().trim();
            if (isNotSure) {
                return pText.startsWith("not sure");
            } else if (isShortAnswer) {
                return pText === targetText;
            } else {
                return pText.startsWith(searchString);
            }
        });
        
        if (targetP) {
          const parentRow = targetP.parentElement;
          let radio = parentRow.querySelector('input[type="radio"]');
          if (attemptClick(radio, "Scoped")) clicked = true;
        }
      }
    }

    // Global Fallback
    if (!clicked) {
        const allTags = Array.from(document.querySelectorAll('p, span, div'));
        const targetEl = allTags.find(el => {
            if (el.children.length > 1) return false; 
            const t = el.innerText.toLowerCase().trim();
            if (isNotSure) {
                return t.startsWith("not sure") && t.length > 15; 
            }
            return t === targetText || (t.startsWith(searchString) && t.length < 100);
        });
        if (targetEl) {
            let radio = null;
            let parent = targetEl.parentElement;
            for (let i = 0; i < 3; i++) {
                if (parent) {
                    radio = parent.querySelector('input[type="radio"]');
                    if (radio) break;
                    parent = parent.parentElement;
                }
            }
            if (attemptClick(radio, "Global")) clicked = true;
        }
    }
    await new Promise(r => setTimeout(r, 1500)); 
  }
}

// --- HELPER: HUMAN SIMULATION ---
function simulateHumanActivity(merchantUrl, duration) {
  const statusDiv = document.getElementById('status'); 
  const merchantHostname = new URL(merchantUrl).hostname;
  
  chrome.tabs.create({ url: merchantUrl, active: false }, (mt) => {
    activeTabs.push(mt.id);
    const query = encodeURIComponent(`"${merchantHostname}" reviews`);
    chrome.tabs.create({ url: `https://www.google.com/search?q=${query}`, active: false }, (st) => {
      activeTabs.push(st.id);
      setTimeout(() => { chrome.tabs.remove(st.id, () => { if (chrome.runtime.lastError) {} }); }, (Math.random() * 20000 + 30000));
      setTimeout(() => { chrome.tabs.remove(mt.id, () => { if (chrome.runtime.lastError) {} }); }, (Math.random() * 30000 + 45000));
    });
  });
}

// --- GEMINI API CALL (With Strict Q5 Options) ---
async function callGemini(apiKey, targetUrl, liveStatus) {
  let promptPrefix = "";
  if (liveStatus === "DEAD_STORE") {
      promptPrefix = `
      🚨 **CRITICAL ALERT** 🚨
      The live website content was fetched and CONFIRMED as DEAD/UNAVAILABLE.
      YOU MUST:
      1. Select "c. Omit" for Q1.
      2. Select "Broken Link" or "Login Page" for Q2.
      `;
  }

  const systemPrompt = `
    ${promptPrefix}
    ROLE: You are an expert Merchant Quality Auditor following "Merchant Quality Signal v4" Guidelines.
    TASK: Audit this URL: ${targetUrl}
    
    STRICT GUIDELINES (V4):
    
    1. Q1 (RECOGNIZABLE): 
       - Look for coverage in "Reputable Press" (local or global, e.g. Vogue, NYT, Yahoo Finance).
       - EXCLUDE: Listicles, Blogs, and Negative Press (e.g. bankruptcy).
       - Select "c. Omit" if: Broken Link, Password/Login Required, or "Service Provider".
       - Select "b. No" if live but no reputable press found.
       
    2. Q2 (REVIEWS) - AUTHENTICITY RULES:
       - 100% 5-Star Reviews = INAUTHENTIC (Select "Not sure").
       - <10 Reviews all from same time period = INAUTHENTIC (Select "Not sure").
       - >100 Reviews with >90% Max Rating = Red Flag (Select "Not sure").
       - Authentic = Majority positive on 3rd party sites (TrustPilot/Reddit).

    3. Q4 (IMAGE QUALITY):
       - Must be 90% Consistent (e.g. all white background OR all lifestyle). 50/50 mix = Low Quality ("No").
       - Low Quality = Watermarks, Generic Stock Photos, Blurry/Selfie style.

    4. Q5 (DROP SHIPPER):
       - Reverse image match + NOT a Retailer/Marketplace = Drop Shipper.
       - Low Quality Signals = Sitewide sales, Ad heavy, Countdowns.

    5. Q9 (SHOP WORTHY):
       - DEFAULT to "a. Yes" unless you are confident the merchant is low quality.

    OUTPUT FORMAT (Strictly Numbered for Auto-Fill):
    
    [IF NORMAL - Answer ALL Questions]
    1. Q1 (Recognizable) - Option: b. No, this is not a recognizable merchant since there's little public information about it
    2. Q2 (Reviews) - Option: Not sure, the reviews are mixed or the reviews may be unauthentic
    (OR) 2. Q2 (Reviews) - Option: a. Yes, the merchant has authentic reviews and interactions with users
    (OR) 2. Q2 (Reviews) - Option: b. No, this merchant does not have reviews nor interactions with users or all reviews are negative
    3. Q3 (Categories) - Option: a. Yes, there are different categories available
    4. Q4 (Images) - Option: a. Yes, the majority (90%) of product images are high quality, professional, not animated, and consistent
    5. Q5 (Dropshipper) - Option: No, the merchant does not appear to be a drop shipper
    (OR) 5. Q5 (Dropshipper) - Option: Yes, low quality - the merchant is a drop shipper and has some of the low quality signals
    (OR) 5. Q5 (Dropshipper) - Option: Yes, high quality - the merchant is a drop shipper and does not have any of the low quality signals
    6. Q6 (Security) - Option: a. Yes
    7. Q7 (Details) - Option: a. Yes, there are sufficient product details
    8. Q8 (Complete) - Option: a. Yes
    9. Q9 (Shop?) - Option: a. Yes

    [IF DEAD/OMIT - Broken]
    1. Q1 (Recognizable) - Option: c. Omit - broken link, login page, service provider
    2. Q2 (Reason) - Option: Broken Link

    [IF DEAD/OMIT - Login]
    1. Q1 (Recognizable) - Option: c. Omit - broken link, login page, service provider
    2. Q2 (Reason) - Option: Login Page
  `;

  const model = "gemini-2.5-pro"; 
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ parts: [{ text: systemPrompt }] }],
    tools: [{ google_search: {} }] 
  };

  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!response.ok) throw new Error("API Error");
  const data = await response.json();
  let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "Error";
  
  let displayHtml = rawText
    .replace(/\n/g, "<br>")
    .replace(/(\d+\.\sQ\d+.*?)-/g, "<strong>$1</strong>-");
  
  return { rawText, displayHtml };
}
