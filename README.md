# Bill Counting Tool

## Introduction


A browser-based utility to quickly parse and analyze Public Financial Management System (PFMS) reports. This tool categorizes vouchers, differentiates between bill types, and extracts token numbers from XML, PDF, and Excel files.

**Live Demo:** **[https://samueladmand.github.io/Bill-Counting-Tool/](https://samueladmand.github.io/Bill-Counting-Tool/)**



## Key Features

-   **Multi-Format Support:** Analyze `.xml`, `.pdf`, and `.xlsx` report files.
-   **Drag & Drop Interface:** Simple and intuitive file uploading.
-   **Automated Categorization:** Automatically separates NCDDO (`V` series) and CDDO (`C` series) vouchers.
-   **Detailed Breakdown:** Classifies vouchers into `Normal Bills` and `e-Bills`.
-   **Token Extraction:** Parses and lists all token numbers for Normal Bills.
-   **Secure & Private:** All processing is done client-side in your browser. No data is ever uploaded.

## How to Use

1.  **Visit the website:** [Open the Bill Counting Tool](https://samueladmand.github.io/Bill-Counting-Tool/).
2.  **Upload File:** Drag and drop your report file or click to select it.
3.  **Analyze:** Click the "Analyze Report" button.
4.  **View Results:** Instantly see a formatted summary of your report.

## Tech Stack

-   **Frontend:** HTML5, Tailwind CSS, JavaScript (ES6+)
-   **Libraries:** [PDF.js](https://mozilla.github.io/pdf.js/), [SheetJS (xlsx.js)](https://sheetjs.com/)