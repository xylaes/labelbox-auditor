// 1. SIMPLE VARIABLES
const apiKeyInput = document.getElementById('apiKey');
const saveBtn = document.getElementById('saveBtn');
const statusDiv = document.getElementById('status');
const auditBtn = document.getElementById('auditBtn');
const output = document.getElementById('output');

// 2. LOAD KEY ON STARTUP
document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(['geminiKey'], (result) => {
    if (result.geminiKey) {
      apiKeyInput.value = result.geminiKey;
      statusDiv.textContent = "✅ Key loaded from memory.";
    }
  });
});

// 3. SAVE FUNCTION
saveBtn.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  
  if (!key) {
    statusDiv.textContent = "❌ Please enter a key first.";
    return;
  }

  chrome.storage.local.set({ geminiKey: key }, () => {
    statusDiv.textContent = "✅ Key Saved!";
    setTimeout(() => { statusDiv.textContent = ""; }, 2000);
  });
});

// 4. AUDIT FUNCTION
auditBtn.addEventListener('click', async () => {
  output.textContent = "⚡️ Gemini 2.5 Pro is analyzing...";
  output.classList.remove('error');

  // GET KEY
  const storage = await chrome.storage.local.get(['geminiKey']);
  if (!storage.geminiKey) {
    output.textContent = "❌ No API Key found. Please save it above.";
    return;
  }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // --- STEP A: FIND THE URL ---
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: () => {
        const links = Array.from(document.querySelectorAll('a'));
        const blockList = ['google.com', 'labelbox.com', 'javascript:', 'mailto:'];
        
        let targetLink = links.find(a => {
            const parentText = a.parentElement ? a.parentElement.innerText : "";
            return parentText.includes("Merchant:"); 
        });

        if (!targetLink) {
             targetLink = links.find(a => {
                const href = a.href.toLowerCase();
                if (blockList.some(bad => href.includes(bad))) return false;
                if (href.length < 5) return false;
                return true;
            });
        }
        return targetLink ? targetLink.href : null;
      }
    });

    const foundFrame = results.find(r => r.result);
    if (!foundFrame || !foundFrame.result) {
      throw new Error("Could not find the Merchant URL. (Try refreshing the page).");
    }

    const pageUrl = foundFrame.result;
    output.textContent = `Target: ${pageUrl}\n\n🧠 Analyzing...`;

    // --- STEP B: CALL GEMINI ---
    const answer = await callGemini(storage.geminiKey, pageUrl);
    output.innerHTML = answer;

  } catch (err) {
    output.textContent = "Error: " + err.message;
    output.classList.add('error');
  }
});

async function callGemini(apiKey, targetUrl) {
  const systemPrompt = `
    ROLE: You are an expert Merchant Quality Auditor.
    TASK: Audit this URL: ${targetUrl}
    
    CRITICAL OVERRIDE: Assume the website URL provided works. Do NOT mark it as "Omit - broken link" unless you find specific search results stating the company is "Permanently Closed" or the domain is "For Sale". If you are unsure, proceed with the audit as if it is live.

    INSTRUCTIONS: Use Google Search to verify facts. Output the answers EXACTLY as written below.

    ---------------------------------------------------------
    STRICT OUTPUT FORMAT (Select ONE option per question exactly as written below):

    **1. Is the merchant recognizable?**
    Option: [Select one: "a. Yes, the merchant is recognizable", "b. No, this is not a recognizable merchant since there's little public information about it", or "c. Omit - broken link, login page, service provider"]
    > Reasoning: [Cite Press source OR "Only blogs found"]

    **2. Does the merchant have authentic reviews or interactions with users?**
    Option: [Select one: "a. Yes, the merchant has authentic reviews and interactions with users", "Not sure, the reviews are mixed or the reviews may be unauthentic (e.g. overwhelmingly positive, contain errors, they are all from the same period)", or "b. No, this merchant does not have reviews nor interactions with users or all reviews are negative"]
    > Reasoning: [Cite Trustpilot/BBB score & count]

    **3. Does the merchant have different product categories?**
    Option: [Select one: "a. Yes, there are different categories available" or "b. No, there are no different categories available"]

    **4. Are the product images high quality?**
    Option: [Select one: "a. Yes, the majority (90%) of product images are high quality, professional, not animated, and consistent", "b. Yes, the majority of the product images are high quality, but they are inconsistent or have minor violations", or "c. No - images are not high quality (e.g. edited product images, unprofessional images, blurry and stretched images should all be marked as low quality etc.)"]

    **5. Is the merchant a drop shipper?**
    Option: [Select one: "a. Yes, low quality - the merchant is a drop shipper and has some of the low quality signals", "b. Yes, high quality - the merchant is a drop shipper and does not have any of the low quality signals", or "c. No, the merchant does not appear to be a drop shipper"]
    > Reasoning: [Cite "About Us" text or business model]

    **6. Does the website feel secure and accept a variety of recognizable and secure major payment options?**
    Option: [Select one: "a. Yes" or "b. No or not sure - unclear availability of major payment options (e.g. Visa), besides Paypal and Venmo; financial information auto-save; unconventional required fields for personal information during checkout, required login"]
    > Reasoning: [List payments found]

    **7. Are there sufficient product details to make a purchase decision?**
    Option: [Select one: "a. Yes, there are sufficient product details" or "b. No, product details are not sufficient"]

    **8. Is the merchant website complete?**
    Option: [Select one: "a. Yes" or "b. No"]
    > Reasoning: [Check for broken links/templates]

    **9. Is this a merchant you would shop from?**
    Option: [Select one: "a. Yes" or "b. No"]
  `;

  const model = "gemini-2.5-pro"; 
  
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  
  const payload = {
    contents: [{ parts: [{ text: systemPrompt }] }],
    tools: [{ google_search: {} }] 
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text(); 
    throw new Error(`Status ${response.status} - ${errText}`);
  }

  const data = await response.json();
  
  let rawText = "";
  if(data.candidates && data.candidates[0].content && data.candidates[0].content.parts) {
      rawText = data.candidates[0].content.parts
        .map(p => p.text || "")
        .join("");
  } else {
      rawText = "Error: Empty response from model.";
  }
  
  rawText = rawText.replace(/\n/g, "<br>");
  rawText = rawText.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

  let header = "";
  if (data.candidates && data.candidates[0].groundingMetadata) {
     header = "✅ <b>Verified with Google Search</b><br><hr>";
  } else {
     header = "⚠️ <b>Analysis based on internal knowledge</b><br><hr>";
  }

  return header + rawText;
}