# LabelBox Auditor 🤖

A Chrome Extension that automates merchant quality auditing for LabelBox tasks using the Gemini API.

**Version 2.0 Now Available!** Featuring autonomous looping and advanced dead-link detection.

## 🚀 Key Features

### ⚙️ Autonomous Mode (New!)
* **Hands-Free Looping:** Automatically processes tasks one after another.
* **Human-Like Timing:** Randomizes audit duration between **4 to 5 minutes** (240s–300s) to strictly adhere to "Average Handling Time" (AHT) safety guidelines.
* **Auto-Submit:** Clicks the submit button automatically once the timer expires.
* **Safety Brake:** Unchecking the toggle instantly pauses the loop.

### 🧟 Zombie Hunter (New!)
* **True Ping:** Detects dead websites (DNS errors, connection refused) using a No-CORS ping method.
* **Content Scan:** Scans live page content for specific "Dead Store" keywords (e.g., *"Sorry, this store is currently unavailable"*, *"Enter using password"*).
* **Smart Omit:** Automatically selects "Omit" -> "Broken Link" for dead sites, bypassing the full audit to save time.

### 🧠 Intelligent Analysis
* **Gemini 2.5 Pro:** Powered by Google's latest model.
* **Guideline v4 Compliance:** System prompts are strictly tuned to **Merchant Quality Signal v4** rules:
    * **Q1:** Excludes listicles/blogs; requires reputable press.
    * **Q2:** Flags 100% 5-star reviews as "Not sure".
    * **Q4:** Enforces 90% image consistency rule.
* **Strict Mode:** Outputs answers that perfectly match LabelBox's specific radio button text for 100% accurate auto-filling.

## 🛠️ Setup

1.  Clone this repository.
2.  Open Chrome and navigate to `chrome://extensions`.
3.  Enable **Developer Mode** (top right corner).
4.  Click **Load Unpacked** and select this folder.
5.  Click the extension icon to open the **Side Panel**.
6.  Paste your Gemini API Key and click **Save**.

## 💻 Tech Stack
* **Core:** JavaScript (Vanilla), HTML5, CSS3
* **Platform:** Chrome Extensions API (Manifest V3)
* **AI:** Google Gemini API (Generative Language)
* **Architecture:** Side Panel UI + Scripting API
