# LabelBox Auditor 🤖

A Chrome Extension that automates merchant quality auditing for LabelBox tasks using the Gemini API.

## Features
* **One-Click Audit:** Automatically detects the "Merchant URL" from the LabelBox interface.
* **AI Analysis:** Uses Google's **Gemini 2.5 Pro** model to analyze the website against specific quality guidelines (Signal v4).
* **Smart Search:** Performs real-time Google searches to verify merchant reputation, reviews, and "dropshipper" status.
* **Strict Mode:** Formats answers to match LabelBox's specific radio button options for faster data entry.

## Setup
1.  Clone this repository.
2.  Open Chrome and navigate to `chrome://extensions`.
3.  Enable **Developer Mode**.
4.  Click **Load Unpacked** and select this folder.
5.  Open the extension side panel and paste your Gemini API Key.

## Tech Stack
* JavaScript (Vanilla)
* Chrome Extensions API (Manifest V3)
* Google Gemini API